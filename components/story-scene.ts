/*
 * The story in three acts, over one scroll value p:
 *
 *   1 · Sealed     [0, 1)    The wallet's lid lifts: inside, a key and a coin. It closes again.
 *   2 · Connected  [1, 2)    An app plugs into the wallet. The lid is forced off, and the coin is pulled out down the cable.
 *   3 · Routed     [2, 3.4]  The wallet reseals. An executable address drops in, opens into its layers, and a coin
 *                            leaves the wallet's slot, passes through every layer and lands in the app.
 *
 * `frame(p, view)` is pure: it says where everything is; components/story-stage.ts draws it.
 * World units are roughly CSS pixels: y is up, the devices face −x, and +z runs toward the viewer's right.
 */

export const LENGTH = 3.4;

export type V3 = [number, number, number];
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** The stage in CSS pixels, and where the copy sits: beside the scene on wide screens, below it on narrow ones. */
export type View = { w: number; h: number; copyRight: number; copyTop: number };

/** What the app's screen shows. */
export type AppScreen = "connect" | "pressed" | "connected" | "send" | "done";

export type Frame = {
  /** Where on the canvas to frame the scene, and the world box to fit there. */
  focus: Rect;
  roi: [V3, V3];
  wallet: {
    lid: { at: V3; tilt: number };
    /** Euler angles in degrees, turned toward the camera. */
    key: { at: V3; rot: V3; scale: number };
    coin: { at: V3; rot: V3; scale: number };
    balance: number;
    alarm: number;
  };
  app: { x: number; screen: AppScreen };
  cursor: { o: number; at: V3; offset: [number, number]; press: number } | null;
  /** The plug's trip from the app (0) into the wallet (1). */
  plug: number;
  /** Requests riding the cable in, and the value pulled out along it: positions from the app (0) to the wallet (1). */
  requests: number[];
  pulse: number | null;
  router: {
    drop: number;
    lift: number;
    bezel: number;
    layers: number[];
    lit: number[];
  } | null;
  /** The deposit in act 3, spinning about its own axis. */
  deposit: { at: V3; spin: number } | null;
};

// ---- Easing ---------------------------------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const out = (t: number) => 1 - (1 - t) ** 3;
const inQuad = (t: number) => t * t;
const linear = (t: number) => t;
/** Settles with the faintest overshoot, like a part seating on a rail. */
const seat = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const span = (p: number, a: number, b: number, e = inOut) => e(clamp01((p - a) / (b - a)));
const hold = (p: number, a: number, b: number, c: number, d: number) => span(p, a, b) * (1 - span(p, c, d));
const tap = (p: number, a: number, b: number) => Math.sin(Math.PI * clamp01((p - a) / (b - a)));

/** A point along a polyline, by length. */
export function along(pts: readonly V3[], t: number): V3 {
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    lens.push(l);
    total += l;
  }
  let d = clamp01(t) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) return lerp3(pts[i], pts[i + 1], lens[i] ? clamp01(d / lens[i]) : 0);
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

/** A quadratic Bézier through space, as a polyline. */
export function curve(a: V3, c: V3, b: V3, steps = 32): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * c[2] + t * t * b[2],
    ]);
  }
  return pts;
}

// ---- The set -------------------------------------------------------------------------------------

/** The wallet: a white face, and behind it a hollow black body up to `rim` with a lid on top. */
export const WALLET = { depth: 150, height: 156, width: 156, face: 22, rim: 106, wall: 7 };
/** On the wallet's right side, near the front. */
export const WALLET_PORT: V3 = [58, 34, WALLET.width / 2];
/** The slot in the wallet's lid, which the deposit leaves through. */
export const WALLET_SLOT: V3 = [88, WALLET.height, 0];

export const APP_X = 990;
export const APP = { depth: 112, height: 172, width: 204 };
export const APP_PORT: V3 = [APP_X + 34, 30, APP.width / 2];
export const APP_SLOT: V3 = [APP_X + 58, APP.height, 0];
/** Where the Connect Wallet button is on the app's screen. */
export const APP_BUTTON: V3 = [APP_X, 52, 0];

/** The executable address: each part's front-face x, closed, and opened out along its rail. */
export const ROUTER = {
  closed: { bezel: 388, layer: (i: number) => 402 + i * 18 },
  open: { bezel: 300, layer: (i: number) => 300 + 92 * (i + 1) },
  layers: 5,
  axis: 72,
};

/** Toward the camera: in front, to the left and above. */
export const VIEW: V3 = [-1, 0.85, 1.1];
/** The yaw (degrees) that turns something facing +z to face the camera. */
const FACING = (Math.atan2(VIEW[0], VIEW[2]) * 180) / Math.PI;

/** The plug's flight: out of the app's port (it starts inside it), up and over, and square into the wallet's side. */
export const PLUG_PATH = curve([APP_PORT[0], APP_PORT[1], APP_PORT[2] - 14], [140, 260, 520], [WALLET_PORT[0], WALLET_PORT[1], WALLET_PORT[2] + 9], 64);

/** Where the cable lies once the plug is in: out of the app's side, along the floor, up into the plug. */
export const CABLE_REST: V3[] = [
  [APP_PORT[0], APP_PORT[1], APP_PORT[2] + 2],
  [APP_PORT[0], 26, APP_PORT[2] + 28],
  [APP_PORT[0] - 10, 5, 170],
  [860, 4, 240],
  [600, 4, 262],
  [330, 4, 250],
  [150, 4, 222],
  [70, 5, 196],
  [WALLET_PORT[0], 20, 160],
  [WALLET_PORT[0], WALLET_PORT[1], 134],
];

/** The key and the coin: lying in the wallet's foam, and floating when it opens. Rotations are degrees (YXZ), yaw from facing the camera. */
export const KEY_REST: V3 = [50, 78, -8];
export const COIN_REST: V3 = [108, 79, 8];
const KEY_REST_ROT: V3 = [-90, -90 - FACING, 0];
const COIN_REST_ROT: V3 = [-90, 0, 0];
const KEY_FLOAT: V3 = [56, 236, -46];
const COIN_FLOAT: V3 = [102, 262, 46];
/** In act 2 the camera is further back, so the exposed key and coin come up larger and further apart. */
const KEY_EXPOSED: V3 = [40, 246, -74];
const COIN_EXPOSED: V3 = [104, 270, 66];

const DEPOSIT_UP = curve([WALLET_SLOT[0], WALLET_SLOT[1] - 18, 0], [WALLET_SLOT[0] + 30, 330, 0], [262, ROUTER.axis + 6, 0], 40);
const DEPOSIT_THROUGH: [V3, V3] = [
  [262, ROUTER.axis, 0],
  [800, ROUTER.axis, 0],
];
const DEPOSIT_OUT = curve([800, ROUTER.axis, 0], [930, 340, 0], [APP_SLOT[0], APP_SLOT[1] - 30, APP_SLOT[2]], 40);

/** What the camera frames. */
const FRAME_CLOSED: [V3, V3] = [
  [-70, 0, -120],
  [200, 230, 140],
];
const FRAME_OPEN: [V3, V3] = [
  [-40, 0, -100],
  [210, 400, 120],
];
const FRAME_CONNECTED: [V3, V3] = [
  [-40, 0, -110],
  [1110, 360, 260],
];
const FRAME_ROUTED: [V3, V3] = [
  [-40, 0, -110],
  [1110, 250, 110],
];

const lerpBox = (a: [V3, V3], b: [V3, V3], t: number): [V3, V3] => [lerp3(a[0], b[0], t), lerp3(a[1], b[1], t)];

// ---- The frame -------------------------------------------------------------------------------------

export function frame(p: number, view: View): Frame {
  const compact = view.w < 900;
  const focus: Rect = compact
    ? { x0: 20, y0: 88, x1: view.w - 20, y1: Math.min(view.h * 0.64, view.copyTop - 8) }
    : { x0: Math.max(view.copyRight + 40, view.w * 0.34), y0: 104, x1: view.w - 40, y1: view.h - 44 };

  // ---- Act 1: the wallet opens to show what it guards, then closes -----------------------------------

  const lift = hold(p, 0.06, 0.28, 0.62, 0.82);
  const rise = hold(p, 0.16, 0.38, 0.54, 0.74);
  const turn = span(p, 0.16, 0.74, linear);

  // ---- Act 2: the connection forces it open ----------------------------------------------------------

  const rewind = span(p, 2.0, 2.12);
  const forced = span(p, 1.42, 1.54, out) * (1 - rewind);
  const exposed = span(p, 1.46, 1.6) * (1 - rewind);
  const up = Math.max(rise, exposed);

  // Lifted straight up in act 1; knocked back and aside in act 2, clear of the key and coin floating out.
  const lid = {
    at: [40 * lift + 150 * forced, 230 * lift + 170 * forced, 40 * forced] as V3,
    tilt: -7 * lift - 20 * forced,
  };

  const offset = (rest: V3, a: V3, b: V3): V3 => [
    rest[0] + (a[0] - rest[0]) * rise + (b[0] - rest[0]) * exposed,
    rest[1] + (a[1] - rest[1]) * rise + (b[1] - rest[1]) * exposed,
    rest[2] + (a[2] - rest[2]) * rise + (b[2] - rest[2]) * exposed,
  ];
  const keyAt = offset(KEY_REST, KEY_FLOAT, KEY_EXPOSED);
  const keyRot = lerp3(KEY_REST_ROT, [-22, -34 + 56 * turn + 24 * exposed, -28], up);

  // The coin: floats in act 1; in act 2 it is pulled into the plug and down the cable. It stays
  // gone while the wallet reseals, and is simply back inside once the lid is on.
  const pull = p < 2.12 ? span(p, 1.6, 1.7) : 0;
  const floating = offset(COIN_REST, COIN_FLOAT, COIN_EXPOSED);
  const coinAt = pull > 0 ? along(curve(floating, [WALLET_PORT[0] - 10, 220, WALLET_PORT[2] + 110], [WALLET_PORT[0], WALLET_PORT[1], WALLET_PORT[2] + 27], 20), pull) : floating;
  const coinRot = lerp3(COIN_REST_ROT, [-18, 8 + 46 * turn - 30 * exposed + 420 * pull, 0], up);
  // Out of the box, both come a little closer; the coin shrinks away into the plug.
  const near = 1 + 0.16 * rise + 0.36 * exposed;
  const coinScale = near * (pull > 0.72 ? lerp(1, 0, (pull - 0.72) / 0.28) : 1);

  let balance = 5000;
  if (p >= 1.66) balance = lerp(5000, 0, span(p, 1.66, 1.86, linear));
  if (p >= 2.0) balance = lerp(balance, 5000, rewind);
  if (p >= 2.95) balance = lerp(5000, 4000, span(p, 2.96, 3.02, linear));
  const alarm = span(p, 1.36, 1.4) * (1 - span(p, 2.04, 2.1));

  const appIn = span(p, 0.94, 1.14, out);
  const press = tap(p, 1.13, 1.19);
  const cursorO = hold(p, 1.02, 1.06, 1.22, 1.3);
  const reach = span(p, 1.04, 1.13);
  const leave = span(p, 1.2, 1.3);
  const cursor = cursorO
    ? {
        o: cursorO,
        at: APP_BUTTON,
        offset: [lerp(lerp(96, 16, reach), 70, leave), lerp(lerp(86, 6, reach), 48, leave)] as [number, number],
        press,
      }
    : null;

  const plug = span(p, 1.2, 1.38) * (1 - span(p, 2.0, 2.12));
  // Requests travel in, value travels out; neither replays as the cable is pulled back.
  const requests = p < 2 ? [0, 1, 2].map((i) => span(p, 1.38 + 0.07 * i, 1.5 + 0.07 * i, linear)).filter((t) => t > 0 && t < 1) : [];
  const pulseT = span(p, 1.68, 1.88, linear);
  const pulse = p < 2 && pulseT > 0 && pulseT < 1 ? 1 - pulseT : null;

  // ---- Act 3: the executable address ---------------------------------------------------------------

  let router: Frame["router"] = null;
  let deposit: Frame["deposit"] = null;
  if (p > 2.12) {
    const boom = (i: number) => span(p, 2.44 + 0.03 * i, 2.66 + 0.03 * i);
    const through = (x: number) => lerp(3.1, 3.22, (x - DEPOSIT_THROUGH[0][0]) / (DEPOSIT_THROUGH[1][0] - DEPOSIT_THROUGH[0][0]));
    const bezel = lerp(ROUTER.closed.bezel, ROUTER.open.bezel, boom(0));
    const layers = Array.from({ length: ROUTER.layers }, (_, i) => lerp(ROUTER.closed.layer(i), ROUTER.open.layer(i), boom(i + 1)));
    router = {
      drop: span(p, 2.14, 2.32, seat),
      lift: span(p, 2.32, 2.52, inQuad),
      bezel,
      layers,
      lit: [bezel, ...layers].map((x) => span(p, through(x + 6), through(x + 6) + 0.025)),
    };

    if (p > 2.94 && p < 3.34) {
      const at =
        p < 3.1
          ? along(DEPOSIT_UP, span(p, 2.94, 3.1))
          : p < 3.22
            ? lerp3(DEPOSIT_THROUGH[0], DEPOSIT_THROUGH[1], span(p, 3.1, 3.22, linear))
            : along(DEPOSIT_OUT, span(p, 3.22, 3.34));
      deposit = { at, spin: 720 * span(p, 2.94, 3.34, linear) };
    }
  }

  const screen: AppScreen =
    p < 2.06 ? (press > 0.4 ? "pressed" : p < 1.3 ? "connect" : "connected") : p < 3.3 ? "send" : "done";

  const roi =
    p < 0.9
      ? lerpBox(FRAME_CLOSED, FRAME_OPEN, lift)
      : p < 2
        ? lerpBox(FRAME_CLOSED, FRAME_CONNECTED, span(p, 0.9, 1.14))
        : lerpBox(FRAME_CONNECTED, FRAME_ROUTED, span(p, 2.02, 2.22));

  return {
    focus,
    roi,
    wallet: {
      lid,
      key: { at: keyAt, rot: keyRot, scale: near },
      coin: { at: coinAt, rot: coinRot, scale: coinScale },
      balance,
      alarm,
    },
    app: { x: APP_X + 460 * (1 - appIn), screen },
    cursor,
    plug,
    requests,
    pulse,
    router,
    deposit,
  };
}

/** Which act p falls in. */
export const actOf = (p: number) => (p < 1 ? 0 : p < 2 ? 1 : 2);

// ---- Pacing ------------------------------------------------------------------------------------------

/**
 * How much scrolling each stretch of the story gets, in screens: [progress at its end, screens].
 * `frame` decides what happens; this decides how long each part lasts under the reader's hand.
 * Holds get as much room as the motion around them, so there's time to take each state in.
 */
const PACE: [number, number][] = [
  [0.06, 0.2],
  [0.38, 0.7], // the lid lifts; the key and coin rise
  [0.54, 0.7], // held open
  [0.82, 0.55], // back inside; the lid closes
  [0.94, 0.25],
  [1.2, 0.6], // the app arrives; Connect Wallet is clicked
  [1.38, 0.45], // the plug flies in
  [1.62, 0.6], // requests arrive; the lid is forced off
  [1.88, 0.7], // the coin is pulled out; the balance drains
  [2, 0.55], // held
  [2.14, 0.35], // the wallet reseals
  [2.52, 0.75], // the executable address drops in; its shell lifts
  [2.8, 0.55], // its layers spread
  [2.94, 0.5], // held open
  [3.1, 0.5], // a coin leaves the wallet's slot
  [3.22, 0.55], // through every layer
  [LENGTH, 0.4], // into the app
];

/** Screens of scrolling that hold the last frame before the page moves on. */
const HOLD_END = 0.1;

/** The whole story, in screens of scrolling. */
export const SCROLL = PACE.reduce((sum, [, screens]) => sum + screens, 0) + HOLD_END;

/** Story progress after `s` screens of scrolling. */
export function progressAt(s: number): number {
  let p0 = 0;
  let s0 = 0;
  for (const [p1, screens] of PACE) {
    if (s <= s0 + screens) return p0 + ((p1 - p0) * Math.max(0, s - s0)) / screens;
    p0 = p1;
    s0 += screens;
  }
  return LENGTH;
}

/** Screens of scrolling at which story progress `p` is reached. */
export function scrollAt(p: number): number {
  let p0 = 0;
  let s0 = 0;
  for (const [p1, screens] of PACE) {
    if (p <= p1) return s0 + (screens * (p - p0)) / (p1 - p0);
    p0 = p1;
    s0 += screens;
  }
  return s0;
}
