import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LOGO_PATH } from "@/components/logo";
import { SESSIONS, short } from "@/components/verify-terms";
import {
  APP,
  APP_PORT,
  APP_X,
  CABLE_REST,
  COIN_REST,
  KEY_REST,
  PLUG_PATH,
  ROUTER,
  VIEW as VIEW_DIR,
  WALLET,
  WALLET_PORT,
  WALLET_SLOT,
  along,
  type AppScreen,
  type Frame,
  type V3,
} from "@/components/story-scene";

/*
 * The story's stage in WebGL: studio-lit hardware with real materials, soft shadows falling on the
 * page, and a long-lens camera looking down from the front left. It renders only when asked.
 */

export type Fonts = { sans: string; mono: string };

const VIEW = new THREE.Vector3(...VIEW_DIR).normalize();
/** Turns a part that faces +z to face the camera, horizontally. */
const FACING = Math.atan2(VIEW.x, VIEW.z);
const DEG = Math.PI / 180;
const FOV = 18;

type Materials = ReturnType<Stage["materials"]>;
type Screen = { ctx: CanvasRenderingContext2D; c: HTMLCanvasElement; tex: THREE.CanvasTexture; last: string };

// ---- Builders ---------------------------------------------------------------------------------------

function trace<T extends THREE.Path>(path: T, w: number, h: number, r: number, cx: number, cy: number) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - r);
  path.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + h);
  path.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r);
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

/** A rounded rectangle, as a shape; `roundedHole` traces the same as a hole. */
const roundedRect = (w: number, h: number, r: number, cx = 0, cy = 0) => trace(new THREE.Shape(), w, h, r, cx, cy);
const roundedHole = (w: number, h: number, r: number, cx = 0, cy = 0) => trace(new THREE.Path(), w, h, r, cx, cy);

function circle(r: number, cx = 0, cy = 0) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

/** A box rounded along its top edges only, standing on y = 0: its lower half is folded flat into its base. */
function cap(w: number, h: number, d: number, r: number, mat: THREE.Material, segments = 8) {
  const geo = new RoundedBoxGeometry(w, h * 2, d, segments, r);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) pos.setY(i, 0);
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w: number, h: number, d: number, r: number, mat: THREE.Material, segments = 6) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, r), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A flat part built facing +z, turned to sit on a device's front face (−x), `lift` proud of it. */
function onFront<T extends THREE.Object3D>(obj: T, y: number, z: number, lift = 0.3) {
  obj.rotation.y = -Math.PI / 2;
  obj.position.set(-lift, y, z);
  return obj;
}

/** The same, lying on a top face (+y). */
function onTop<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number) {
  obj.rotation.x = -Math.PI / 2;
  obj.position.set(x, y, z);
  return obj;
}

/**
 * A slab with a front face of w × h (radius r) and a round aperture, t thick, standing with its
 * face toward −x and its front at x = 0. `print` is drawn on the face.
 */
function slab(w: number, h: number, r: number, t: number, hole: number, face: THREE.Material, side: THREE.Material) {
  const shape = roundedRect(w, h, r);
  if (hole) shape.holes.push(circle(hole));
  const bevel = Math.min(2, t / 4);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: t - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 40,
  });
  const mesh = new THREE.Mesh(geo, [face, side]);
  mesh.rotation.y = -Math.PI / 2;
  mesh.position.x = t - bevel;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Whether a part takes part in shadows. With variance shadow maps three.js also draws every shadow
 * *receiver* into the map, so a part in the air must stop receiving as well as casting.
 */
function shadows(obj: THREE.Object3D, on: boolean) {
  obj.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (o.userData.receives === undefined) o.userData.receives = o.receiveShadow;
    o.castShadow = on;
    o.receiveShadow = on && o.userData.receives;
  });
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Maps a texture over a w × h face whose UVs are its own coordinates, centred. */
function fitFace<T extends THREE.Texture>(t: T, w: number, h: number) {
  t.repeat.set(1 / w, 1 / h);
  t.offset.set(0.5, 0.5);
  return t;
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The USDC mark: a blue disc, two arcs and a dollar sign. With `relief`, its height map instead. */
export function usdc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sans: string, relief = false) {
  ctx.save();
  ctx.fillStyle = relief ? "#5c5c5c" : "#2775ca";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineWidth = r * 0.09;
  for (const [a0, a1] of [
    [Math.PI * 0.64, Math.PI * 1.36],
    [-Math.PI * 0.36, Math.PI * 0.36],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.71, a0, a1);
    ctx.stroke();
  }
  ctx.font = `800 ${Math.round(r * 0.8)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", cx, cy + r * 0.05);
  ctx.restore();
}

/** A soft round glow, for lights that should read as lit. */
function glowTexture(color: string): THREE.CanvasTexture {
  const { c, ctx } = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.16, color);
  g.addColorStop(0.4, color.replace(/[\d.]+\)$/, "0.35)"));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(c);
}

// ---- Screens ----------------------------------------------------------------------------------------

/** The wallet's display: the balance and the USDC mark, behind glass. */
function drawDisplay(s: Screen, fonts: Fonts, value: string, alarm: boolean) {
  const { ctx, c } = s;
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = "#050506";
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, w * 0.55);
  glow.addColorStop(0, alarm ? "rgba(120, 20, 24, 0.35)" : "rgba(40, 60, 90, 0.28)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const size = Math.round(h * 0.29);
  ctx.font = `600 ${size}px ${fonts.sans}`;
  const tw = ctx.measureText(value).width;
  const logo = size * 0.86;
  const gap = size * 0.24;
  const x0 = (w - (tw + gap + logo)) / 2;
  const cy = h * 0.52;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.shadowColor = alarm ? "rgba(255, 70, 70, 0.8)" : "rgba(255, 255, 255, 0.55)";
  ctx.shadowBlur = size * 0.16;
  ctx.fillStyle = alarm ? "#ff5a5c" : "#f6f5f1";
  ctx.fillText(value, x0, cy);
  ctx.shadowBlur = 0;
  usdc(ctx, x0 + tw + gap + logo / 2, cy - size * 0.02, logo / 2, fonts.sans);

  // The cover glass catches a little light across its top.
  const sheen = ctx.createLinearGradient(0, 0, w * 0.4, h);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.07)");
  sheen.addColorStop(0.45, "rgba(255, 255, 255, 0.015)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
}

/** The app: an earn page that asks to connect, and later just asks for a send. */
function drawApp(s: Screen, fonts: Fonts, state: AppScreen) {
  const { ctx, c } = s;
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = "#050506";
  ctx.fillRect(0, 0, w, h);
  const m = 34;
  pill(ctx, m, m, w - m * 2, h - m * 2, 26);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  // Browser chrome.
  ctx.fillStyle = "#f3f2ee";
  ctx.fillRect(0, 0, w, m + 76);
  ctx.fillStyle = "#e6e4de";
  ctx.fillRect(0, m + 75, w, 2);
  ["#ee6a5f", "#f5bd4f", "#61c454"].forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(m + 40 + i * 30, m + 38, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  pill(ctx, m + 160, m + 18, w - m * 2 - 320, 40, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.fillStyle = "#8a8983";
  ctx.font = `500 22px ${fonts.sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("app.example.com", w / 2, m + 39);

  const x = m + 56;
  const right = w - m - 56;
  ctx.textAlign = "left";
  if (state === "send" || state === "done") {
    ctx.fillStyle = "#0b0b0c";
    ctx.font = `700 54px ${fonts.sans}`;
    ctx.fillText("Deposit 1,000 USDC", x, m + 170);
    ctx.fillStyle = "#6b6a66";
    ctx.font = `400 28px ${fonts.sans}`;
    ctx.fillText("Steakhouse Prime USDC · Morpho vault", x, m + 222);
    if (state === "send") {
      // An address to send to, and its QR code. No wallet to connect.
      const q = 250;
      const qy = m + 280;
      ctx.fillStyle = "#0b0b0c";
      const cell = q / 25;
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let r = 0; r < 25; r++)
        for (let k = 0; k < 25; k++) {
          const finder = (r < 7 && k < 7) || (r < 7 && k > 17) || (r > 17 && k < 7);
          if (!finder && rand() > 0.5) ctx.fillRect(x + k * cell, qy + r * cell, cell, cell);
        }
      for (const [fx, fy] of [
        [0, 0],
        [18, 0],
        [0, 18],
      ]) {
        ctx.fillRect(x + fx * cell, qy + fy * cell, cell * 7, cell * 7);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + (fx + 1) * cell, qy + (fy + 1) * cell, cell * 5, cell * 5);
        ctx.fillStyle = "#0b0b0c";
        ctx.fillRect(x + (fx + 2) * cell, qy + (fy + 2) * cell, cell * 3, cell * 3);
      }
      const tx = x + q + 44;
      ctx.fillStyle = "#6b6a66";
      ctx.font = `500 26px ${fonts.sans}`;
      ctx.fillText("Send exactly 1,000 USDC to", tx, qy + 50);
      pill(ctx, tx, qy + 84, right - tx, 70, 16);
      ctx.fillStyle = "#f3f2ee";
      ctx.fill();
      ctx.fillStyle = "#0b0b0c";
      ctx.font = `600 34px ${fonts.mono}`;
      // The Morpho deposit the verify section opens up, so the address matches there.
      ctx.fillText(short(SESSIONS[0].address), tx + 24, qy + 120);
      ctx.fillStyle = "#6b6a66";
      ctx.font = `400 24px ${fonts.sans}`;
      ctx.fillText("From any wallet or exchange", tx, qy + 196);
    } else {
      const cy = m + 420;
      ctx.fillStyle = "#18a058";
      ctx.beginPath();
      ctx.arc(x + 70, cy, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 16;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x + 38, cy + 2);
      ctx.lineTo(x + 62, cy + 26);
      ctx.lineTo(x + 104, cy - 22);
      ctx.stroke();
      ctx.fillStyle = "#0b0b0c";
      ctx.font = `700 46px ${fonts.sans}`;
      ctx.fillText("Deposited", x + 176, cy - 20);
      ctx.fillStyle = "#6b6a66";
      ctx.font = `400 28px ${fonts.sans}`;
      ctx.fillText("1,000 USDC · wallet never connected", x + 176, cy + 32);
    }
  } else {
    ctx.fillStyle = "#0b0b0c";
    ctx.font = `700 56px ${fonts.sans}`;
    ctx.fillText("Earn 5.1% on USDC", x, m + 172);
    ctx.fillStyle = "#6b6a66";
    ctx.font = `400 28px ${fonts.sans}`;
    ctx.fillText("Steakhouse Prime USDC · Morpho vault", x, m + 226);
    pill(ctx, x, m + 268, right - x, 104, 22);
    ctx.fillStyle = "#f7f6f3";
    ctx.fill();
    ctx.strokeStyle = "#e6e4de";
    ctx.lineWidth = 3;
    ctx.stroke();
    usdc(ctx, x + 56, m + 320, 24, fonts.sans);
    ctx.fillStyle = "#0b0b0c";
    ctx.font = `600 44px ${fonts.sans}`;
    ctx.fillText("1,000", x + 100, m + 322);
    ctx.textAlign = "right";
    ctx.fillStyle = "#8a8983";
    ctx.font = `500 28px ${fonts.sans}`;
    ctx.fillText("USDC", right - 36, m + 322);

    const by = m + 410;
    const bh = 128;
    const bw = right - x;
    if (state === "connected") {
      pill(ctx, x, by, bw, bh, bh / 2);
      ctx.fillStyle = "#f3f2ee";
      ctx.fill();
      ctx.fillStyle = "#e5484d";
      ctx.beginPath();
      ctx.arc(x + 72, by + bh / 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = "#0b0b0c";
      ctx.font = `600 40px ${fonts.mono}`;
      ctx.fillText("0x3f5C…a91D", x + 104, by + bh / 2 + 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#8a8983";
      ctx.font = `500 30px ${fonts.sans}`;
      ctx.fillText("Connected", right - 50, by + bh / 2 + 2);
    } else {
      // The hero's Aqua button.
      const pressed = state === "pressed";
      const y = by + (pressed ? 4 : 0);
      pill(ctx, x, y, bw, bh, bh / 2);
      const fill = ctx.createLinearGradient(0, y, 0, y + bh);
      fill.addColorStop(0, pressed ? "#1a5fdc" : "#1f6fff");
      fill.addColorStop(1, pressed ? "#74b5e8" : "#86ccff");
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 45, 140, 0.55)";
      ctx.lineWidth = 3;
      ctx.stroke();
      pill(ctx, x + 26, y + 6, bw - 52, bh * 0.46, bh * 0.23);
      const gloss = ctx.createLinearGradient(0, y + 6, 0, y + 6 + bh * 0.46);
      gloss.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      gloss.addColorStop(1, "rgba(255, 255, 255, 0.12)");
      ctx.fillStyle = gloss;
      ctx.fill();
      ctx.textAlign = "center";
      ctx.font = `600 50px ${fonts.sans}`;
      ctx.fillStyle = "rgba(0, 40, 120, 0.5)";
      ctx.fillText("Connect Wallet", (x + right) / 2, y + bh / 2 + 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("Connect Wallet", (x + right) / 2, y + bh / 2);
    }
  }
  ctx.restore();

  const sheen = ctx.createLinearGradient(0, 0, w * 0.5, h);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.1)");
  sheen.addColorStop(0.5, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
}

/** The ink printed around each router part's aperture. */
function drawGlyph(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, kind: number, hole: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W * s, H * s);
  const cx = (W * s) / 2;
  const cy = (H * s) / 2;
  const u = s;
  ctx.strokeStyle = "#4a4a4e";
  ctx.fillStyle = "#4a4a4e";
  ctx.lineWidth = 0.9 * u;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const R = (hole + 5) * u;
  const dot = (x: number, y: number, r: number, fill = true) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) ctx.fill();
    else ctx.stroke();
  };
  // Four screws, and a fine inset line: every part is a machined plate.
  const inset = 7 * u;
  ctx.globalAlpha = 0.28;
  pill(ctx, inset, inset, W * s - inset * 2, H * s - inset * 2, 9 * u);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (kind === 0) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      dot(cx + Math.cos(a) * (R + 10 * u), cy + Math.sin(a) * (R + 10 * u), 1.1 * u);
    }
  } else if (kind === 1) {
    // A gauge: exactly one amount fits.
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      const long = i % 5 === 0;
      ctx.lineWidth = (long ? 1.1 : 0.6) * u;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(cx + Math.cos(a) * (R + (long ? 9 : 5) * u), cy + Math.sin(a) * (R + (long ? 9 : 5) * u));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 4 * u, cy - R - 16 * u);
    ctx.lineTo(cx + 4 * u, cy - R - 16 * u);
    ctx.lineTo(cx, cy - R - 10 * u);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 2) {
    // One route, of many that aren't taken.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x1 = cx + Math.cos(a) * (R + 30 * u);
      const y1 = cy + Math.sin(a) * (R + 30 * u);
      const chosen = i === 7;
      ctx.globalAlpha = chosen ? 1 : 0.35;
      ctx.lineWidth = (chosen ? 1.6 : 0.8) * u;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      dot(x1, y1, (chosen ? 3.2 : 2.2) * u, chosen);
    }
    ctx.globalAlpha = 1;
  } else if (kind === 3) {
    // Back to the sender.
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12 * u, -Math.PI * 0.35, Math.PI * 1.2);
    ctx.stroke();
    const a = -Math.PI * 0.35;
    const ax = cx + Math.cos(a) * (R + 12 * u);
    const ay = cy + Math.sin(a) * (R + 12 * u);
    ctx.beginPath();
    ctx.moveTo(ax - 7 * u, ay - 2 * u);
    ctx.lineTo(ax + 1 * u, ay + 1 * u);
    ctx.lineTo(ax - 1 * u, ay + 9 * u);
    ctx.stroke();
  } else if (kind === 4) {
    // A deadline.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.lineWidth = (i % 3 ? 0.8 : 1.4) * u;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R + 4 * u), cy + Math.sin(a) * (R + 4 * u));
      ctx.lineTo(cx + Math.cos(a) * (R + (i % 3 ? 9 : 13) * u), cy + Math.sin(a) * (R + (i % 3 ? 9 : 13) * u));
      ctx.stroke();
    }
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 18 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 0.6);
    ctx.stroke();
  } else {
    // A hash of the terms, in a ring.
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let ring = 0; ring < 3; ring++) {
      const rr = R + (6 + ring * 7) * u;
      const n = 28 + ring * 6;
      for (let i = 0; i < n; i++) {
        if (rand() < 0.45) continue;
        const a = (i / n) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        ctx.rotate(a);
        ctx.fillRect(-2.2 * u, -2.2 * u, 4.4 * u, 4.4 * u);
        ctx.restore();
      }
    }
  }
}

// ---- The stage ------------------------------------------------------------------------------------------

export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);
  private fonts: Fonts;
  private size = { w: 1, h: 1 };
  private distance = 4000;
  private disposables: { dispose(): void }[] = [];

  private lid = new THREE.Group();
  private key = new THREE.Group();
  private coin: THREE.Group;
  private deposit: THREE.Group;
  private led!: THREE.MeshBasicMaterial;
  private display!: Screen;
  private appScreen!: Screen;
  private app = new THREE.Group();
  private plug = new THREE.Group();
  private cable: THREE.Mesh;
  private requests: THREE.Sprite[] = [];
  private pulse: THREE.Sprite;
  private router = new THREE.Group();
  private shell = new THREE.Group();
  private rail!: THREE.Mesh;
  private railLength = 0;
  private parts: THREE.Group[] = [];
  private rings: THREE.MeshBasicMaterial[] = [];
  private blobs: THREE.Mesh[] = [];
  private M: Materials;

  constructor(canvasEl: HTMLCanvasElement, fonts: Fonts) {
    this.fonts = fonts;
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.035).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.95;
    room.dispose();
    pmrem.dispose();
    this.disposables.push(env);

    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(220, 1900, 420);
    sun.target.position.set(500, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -1200, right: 1200, top: 1200, bottom: -1200, near: 100, far: 4200 });
    sun.shadow.radius = 10;
    sun.shadow.blurSamples = 20;
    sun.shadow.bias = -0.0004;
    // A soft fill from the camera's side models the faces the overhead key light only grazes.
    const fill = new THREE.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-900, 700, 1100);
    this.scene.add(sun, sun.target, fill, new THREE.HemisphereLight(0xffffff, 0xe7e4dc, 0.3));

    // The page catches the shadows.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.ShadowMaterial({ opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.camera.up.set(0, 1, 0);
    this.M = this.materials();
    this.buildWallet();
    this.coin = this.buildCoin();
    this.deposit = this.buildCoin();
    this.deposit.scale.setScalar(0.66);
    this.scene.add(this.coin, this.deposit);
    this.buildApp();
    this.buildPlug();
    this.cable = new THREE.Mesh(new THREE.BufferGeometry(), this.M.cable);
    this.cable.castShadow = true;
    this.scene.add(this.cable);
    const red = new THREE.SpriteMaterial({ map: glowTexture("rgba(240, 60, 64, 1)"), depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(red);
      s.scale.setScalar(34);
      this.requests.push(s);
      this.scene.add(s);
    }
    this.pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(39, 117, 202, 1)"), depthWrite: false }));
    this.pulse.scale.setScalar(56);
    this.scene.add(this.pulse);
    this.disposables.push(red, this.pulse.material);
    this.buildRouter();
  }

  // ---- Materials ------------------------------------------------------------------------------------

  private materials() {
    const m = {
      black: new THREE.MeshPhysicalMaterial({ color: 0x151517, roughness: 0.58, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.5 }),
      white: new THREE.MeshPhysicalMaterial({ color: 0xf1f0ec, roughness: 0.46, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.45 }),
      foam: new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 1, metalness: 0 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xe0e1e3, roughness: 0.22, metalness: 1 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x7c7e83, roughness: 0.32, metalness: 1 }),
      aluminium: new THREE.MeshPhysicalMaterial({ color: 0xd8dadd, roughness: 0.34, metalness: 1 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe2b857, roughness: 0.3, metalness: 1 }),
      cable: new THREE.MeshPhysicalMaterial({ color: 0x1b1b1d, roughness: 0.55, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
      cavity: new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 1, metalness: 0 }),
      glassEdge: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.25, metalness: 0 }),
    };
    this.disposables.push(...Object.values(m));
    return m;
  }

  private blob(w: number, d: number) {
    const { c, ctx } = canvas(256, 256);
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.5, "rgba(0,0,0,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const map = texture(c, false);
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.5 });
    this.disposables.push(map, mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.2;
    this.blobs.push(mesh);
    return mesh;
  }

  /** A USB-C receptacle, facing +z: a machined steel shell, a dark well and a contact tongue. */
  private port() {
    const { M } = this;
    const g = new THREE.Group();
    const lip = roundedRect(33, 13, 6.5);
    lip.holes.push(roundedHole(28.6, 8.8, 4.4));
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(lip, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 3, curveSegments: 32 }),
      M.steel,
    );
    const well = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(29, 9.2, 4.6), 32), M.cavity);
    well.position.z = -0.3;
    const tongue = new THREE.Mesh(new RoundedBoxGeometry(18, 2.9, 1, 2, 0.4), M.darkSteel);
    tongue.position.z = 0.1;
    const pins = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 1), M.gold);
    pins.position.z = 0.65;
    g.add(rim, well, tongue, pins);
    return g;
  }

  private screw() {
    const { M } = this;
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.8, 32), M.darkSteel);
    head.rotation.x = Math.PI / 2;
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.5), M.cavity);
    cross.position.z = 0.42;
    const cross2 = cross.clone();
    cross2.rotation.z = Math.PI / 2;
    g.add(head, cross, cross2);
    return g;
  }

  // ---- The wallet ---------------------------------------------------------------------------------------

  private lidHome = new THREE.Vector3();
  private lidMesh!: THREE.Mesh;

  private buildWallet() {
    const { M } = this;
    const { depth, height, width, face, rim, wall } = WALLET;
    const wallet = new THREE.Group();

    // The white face.
    const plate = box(face, height, width, 11, M.white, 8);
    plate.position.set(face / 2, height / 2, 0);
    wallet.add(plate);

    // The display, under glass in a black bezel.
    const dw = 124;
    const dh = 70;
    const d = canvas(1024, Math.round((1024 * dh) / dw));
    const tex = fitFace(texture(d.c), dw, dh);
    this.display = { ...d, tex, last: "" };
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1,
    });
    this.disposables.push(glassMat, tex);
    const glass = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRect(dw, dh, 11), { depth: 0.6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 24 }),
      [glassMat, M.glassEdge],
    );
    wallet.add(onFront(glass, 100, 0, 1.2));

    // Below it: the confirm button, a status light, and four screws.
    const button = new THREE.Group();
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 3, 48), M.aluminium);
    knob.rotation.x = Math.PI / 2;
    knob.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.4, 0.8, 12, 48), M.darkSteel);
    button.add(knob, ring);
    wallet.add(onFront(button, 38, 0, 1.2));
    this.led = new THREE.MeshBasicMaterial({ color: 0x33d975 });
    this.disposables.push(this.led);
    const ledRing = new THREE.Mesh(new THREE.RingGeometry(2.3, 3.3, 32), M.glassEdge);
    wallet.add(onFront(new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), this.led), 38, 32, 0.25), onFront(ledRing, 38, 32, 0.25));
    for (const [y, z] of [
      [12, -66],
      [12, 66],
      [144, -66],
      [144, 66],
    ])
      wallet.add(onFront(this.screw(), y, z, 0.1));

    // The body: hollow, matte black, open at the top under the lid.
    const bodyFront = 10;
    const b = 1.5;
    const outer = roundedRect(depth - bodyFront - b * 2, width - b * 2, 13, (bodyFront + depth) / 2, 0);
    outer.holes.push(roundedHole(depth - bodyFront - wall * 2 - b * 2, width - wall * 2 - b * 2, 5, (bodyFront + depth) / 2, 0));
    const body = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outer, { depth: rim - b * 2, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 24 }),
      M.black,
    );
    body.rotation.x = -Math.PI / 2;
    body.position.y = b;
    body.castShadow = true;
    body.receiveShadow = true;
    wallet.add(body);

    // Inside: a foam insert with a pocket for each of its contents.
    const cw = depth - bodyFront - wall * 2;
    const cz = width - wall * 2;
    const cx = (bodyFront + depth) / 2;
    const base = box(cw, 76, cz, 4, M.foam, 2);
    base.position.set(cx, 38, 0);
    const top = roundedRect(cw, cz, 5, cx, 0);
    top.holes.push(keyPocket(KEY_REST), circle(33, COIN_REST[0], -COIN_REST[2]));
    const insert = new THREE.Mesh(new THREE.ExtrudeGeometry(top, { depth: 8, bevelEnabled: false, curveSegments: 32 }), M.foam);
    insert.rotation.x = -Math.PI / 2;
    insert.position.y = 76;
    insert.receiveShadow = true;
    wallet.add(base, insert);

    // The lid: flush with the body, square underneath, with a slot for sending.
    const lidLen = depth - bodyFront;
    const lidH = height - rim;
    const lid = cap(lidLen, lidH, width, 13, M.black);
    this.lid.add(lid);
    const slotEdge = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(94, 12, 6), 24), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.35 }));
    const slot = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(90, 8, 4), 24), M.cavity);
    const lx = WALLET_SLOT[0] - (bodyFront + lidLen / 2);
    slotEdge.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    slotEdge.position.set(lx, lidH + 0.2, 0);
    slot.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    slot.position.set(lx, lidH + 0.35, 0);
    this.lid.add(slotEdge, slot);
    this.disposables.push(slotEdge.material as THREE.Material);
    this.lidHome.set(bodyFront + lidLen / 2, rim, 0);
    this.lid.position.copy(this.lidHome);
    this.lidMesh = lid;
    wallet.add(this.lid);

    // The port, on the right side.
    const port = this.port();
    port.position.set(WALLET_PORT[0], WALLET_PORT[1], WALLET_PORT[2] + 0.15);
    wallet.add(port);

    this.buildKey();
    wallet.add(this.key);
    this.scene.add(wallet, this.blob(260, 250));
    this.blobs[this.blobs.length - 1].position.set(76, 0.2, 0);
  }

  /** A modern cut key in brass: shaped bow, shouldered blade, milled grooves and real bitting. */
  private buildKey() {
    const s = keyOutline();
    s.holes.push(circle(5.6, -14 - KEY_MID, 0));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.8, bevelSegments: 5, curveSegments: 40 });
    geo.translate(0, 0, -1.1);

    // The grooves along the blade, and a fine brushed grain, as a height map over the key's own coordinates.
    const W = 116;
    const H = 44;
    const k = 12;
    const { c, ctx } = canvas(W * k, H * k);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, W * k, H * k);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.05)`;
      ctx.fillRect(Math.random() * W * k, Math.random() * H * k, 30 + Math.random() * 120, 1.5);
    }
    const toX = (x: number) => (x + W / 2) * k;
    const toY = (y: number) => (H / 2 - y) * k;
    ctx.fillStyle = "#2c2c2c";
    for (const [y0, y1] of [
      [3.6, 1.2],
      [-2.4, -4.6],
    ]) {
      ctx.fillRect(toX(20 - KEY_MID), toY(y0), (78 - 20) * k, (y0 - y1) * k);
    }
    const bump = fitFace(texture(c, false), W, H);
    const brass = new THREE.MeshPhysicalMaterial({
      color: 0xe7bf62,
      metalness: 1,
      roughness: 0.27,
      bumpMap: bump,
      bumpScale: 1.6,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
    });
    this.disposables.push(bump, brass);
    const mesh = new THREE.Mesh(geo, brass);
    mesh.castShadow = true;
    this.key.add(mesh);
  }

  /** A coin in USDC's colours: enamel faces with raised marks and a reeded, polished rim. */
  private coinParts?: { body: THREE.CylinderGeometry; edge: THREE.TorusGeometry; face: THREE.Material; rim: THREE.Material };

  private buildCoin() {
    if (!this.coinParts) {
      const f = canvas(1024, 1024);
      f.ctx.fillStyle = "#2775ca";
      f.ctx.fillRect(0, 0, 1024, 1024);
      usdc(f.ctx, 512, 512, 440, this.fonts.sans);
      const face = texture(f.c);

      const b = canvas(1024, 1024);
      b.ctx.fillStyle = "#5c5c5c";
      b.ctx.fillRect(0, 0, 1024, 1024);
      usdc(b.ctx, 512, 512, 440, this.fonts.sans, true);
      const bump = texture(b.c, false);

      const r = canvas(512, 8);
      for (let x = 0; x < 512; x += 8) {
        r.ctx.fillStyle = "#b0b0b0";
        r.ctx.fillRect(x, 0, 4, 8);
        r.ctx.fillStyle = "#505050";
        r.ctx.fillRect(x + 4, 0, 4, 8);
      }
      const reed = texture(r.c, false);
      reed.wrapS = THREE.RepeatWrapping;
      reed.repeat.set(5, 1);

      const faceMat = new THREE.MeshPhysicalMaterial({
        map: face,
        bumpMap: bump,
        bumpScale: 2.4,
        roughness: 0.4,
        metalness: 0.05,
        clearcoat: 0.3,
        clearcoatRoughness: 0.25,
        envMapIntensity: 0.55,
      });
      const rimMat = new THREE.MeshStandardMaterial({ color: 0xdfe0e2, roughness: 0.22, metalness: 1, bumpMap: reed, bumpScale: 1.4 });
      this.coinParts = {
        body: new THREE.CylinderGeometry(30, 30, 5.4, 96, 1),
        edge: new THREE.TorusGeometry(29, 1.5, 16, 96),
        face: faceMat,
        rim: rimMat,
      };
      this.disposables.push(face, bump, reed, faceMat, rimMat, this.coinParts.body, this.coinParts.edge);
    }
    const { body, edge, face, rim } = this.coinParts;
    const coin = new THREE.Group();
    const disc = new THREE.Mesh(body, [rim, face, face]);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    for (const z of [2.7, -2.7]) {
      const lip = new THREE.Mesh(edge, this.M.steel);
      lip.position.z = z;
      lip.castShadow = true;
      coin.add(lip);
    }
    coin.add(disc);
    coin.rotation.order = "YXZ";
    return coin;
  }

  // ---- The app, the plug and the cable ------------------------------------------------------------------

  private buildApp() {
    const { M } = this;
    const { depth, height, width } = APP;
    const body = box(depth, height, width, 16, M.aluminium, 8);
    body.position.set(depth / 2, height / 2, 0);
    this.app.add(body);

    const sw = 188;
    const sh = 150;
    const d = canvas(1024, Math.round((1024 * sh) / sw));
    const tex = fitFace(texture(d.c), sw, sh);
    this.appScreen = { ...d, tex, last: "" };
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.92,
    });
    this.disposables.push(glassMat, tex);
    const glass = new THREE.Mesh(
      new THREE.ExtrudeGeometry(roundedRect(sw, sh, 12), { depth: 0.6, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 24 }),
      [glassMat, M.glassEdge],
    );
    this.app.add(onFront(glass, 92, 0, 1.2));

    const port = this.port();
    port.position.set(APP_PORT[0] - APP_X, APP_PORT[1], APP_PORT[2] + 0.15);
    this.app.add(port);
    const slot = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(92, 8, 4), 24), M.cavity);
    this.app.add(onTop(slot, 58, height + 0.3, 0));
    slot.rotation.z = Math.PI / 2;
    this.scene.add(this.app, this.blob(240, 330));
  }

  private buildPlug() {
    const { M } = this;
    const body = box(30, 17, 24, 7, M.cable, 5);
    body.position.x = -17;
    const collar = box(3, 13.4, 19.4, 1.6, M.darkSteel, 3);
    collar.position.x = -0.5;
    const tip = box(10, 8.2, 18, 3.8, M.steel, 4);
    tip.position.x = 6;
    const relief = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.6, 12, 24), M.cable);
    relief.rotation.z = Math.PI / 2;
    relief.position.x = -37;
    relief.castShadow = true;
    this.plug.add(body, collar, tip, relief);
    this.scene.add(this.plug);
  }

  // ---- The executable address ----------------------------------------------------------------------------

  private buildRouter() {
    const { M } = this;
    const hole = 22;

    const part = (w: number, h: number, t: number, kind: number, r: number) => {
      const s = 6;
      const { c, ctx } = canvas(w * s, h * s);
      drawGlyph(ctx, w, h, s, kind, kind === 0 ? hole + 2 : hole);
      const map = fitFace(texture(c), w, h);
      const face = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map, roughness: 0.44, clearcoat: 0.15, clearcoatRoughness: 0.45 });
      this.disposables.push(map, face);
      const g = new THREE.Group();
      const plate = slab(w, h, r, t, kind === 0 ? hole + 2 : hole, face, M.white);
      plate.position.y = h / 2;
      // A polished ring lines the aperture; a second one lights up green as the deposit passes.
      const lining = new THREE.Mesh(new THREE.TorusGeometry((kind === 0 ? hole + 2 : hole) + 0.2, 1.6, 16, 64), M.steel);
      const lit = new THREE.MeshBasicMaterial({ color: 0x1fc16b, transparent: true, opacity: 0, depthWrite: false });
      this.rings.push(lit);
      this.disposables.push(lit);
      const glow = new THREE.Mesh(new THREE.RingGeometry((kind === 0 ? hole + 2 : hole) + 2, (kind === 0 ? hole + 2 : hole) + 5.5, 64), lit);
      g.add(plate, onFront(lining, h / 2, 0, 0), onFront(glow, h / 2, 0, 0.6));
      return g;
    };

    const bezel = part(164, 144, 12, 0, 18);
    this.parts.push(bezel);
    this.router.add(bezel);
    for (let i = 0; i < ROUTER.layers; i++) {
      const layer = part(136, 128, 14, i + 1, 13);
      layer.position.y = ROUTER.axis - 64;
      this.parts.push(layer);
      this.router.add(layer);
    }

    this.rail = new THREE.Mesh(new THREE.BufferGeometry(), M.aluminium);
    this.rail.castShadow = true;
    this.rail.receiveShadow = true;
    this.router.add(this.rail);

    // The shell: black, with the Execute mark on its side.
    const len = 116;
    const shell = box(len, 146, 166, 20, M.black, 8);
    shell.position.set(len / 2, 73, 0);
    const { c, ctx } = canvas(1024, 512);
    ctx.fillStyle = "#f3f2ee";
    ctx.save();
    ctx.translate(512 - 290, 256 - 116);
    ctx.scale(580 / 1134.66, 580 / 1134.66);
    ctx.translate(-47.9, -414.38);
    ctx.fill(new Path2D(LOGO_PATH), "evenodd");
    ctx.restore();
    const logoMap = texture(c);
    const logoMat = new THREE.MeshStandardMaterial({ map: logoMap, transparent: true, roughness: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.disposables.push(logoMap, logoMat);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(92, 46), logoMat);
    logo.position.set(len / 2, 80, 83.3);
    this.shell.add(shell, logo);
    this.router.add(this.shell);
    this.scene.add(this.router, this.blob(560, 230));
  }

  // ---- Drawing -------------------------------------------------------------------------------------------

  setSize(w: number, h: number) {
    this.size = { w, h };
    // Plenty of pixels on laptops; fewer on very large screens, where they cost the most.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4.6e6 / Math.max(1, w * h))));
    this.renderer.setSize(w, h, false);
  }

  /** Screen position (CSS px) of a world point, for things drawn over the canvas. */
  toScreen(p: V3): [number, number] {
    const v = new THREE.Vector3(...p).project(this.camera);
    return [((v.x + 1) / 2) * this.size.w, ((1 - v.y) / 2) * this.size.h];
  }

  draw(f: Frame) {
    this.frameCamera(f);
    const w = f.wallet;

    this.lid.position.set(this.lidHome.x + w.lid.at[0], this.lidHome.y + w.lid.at[1], this.lidHome.z + w.lid.at[2]);
    this.lid.rotation.z = w.lid.tilt * DEG;
    // A lid floating high above would throw a heavy blot onto the page; only a seated one casts.
    shadows(this.lidMesh, w.lid.at[1] < 12);

    this.key.position.set(...w.key.at);
    this.key.scale.setScalar(w.key.scale);
    // Likewise the key and coin: shadows only while they lie in the box.
    const airborne = w.key.at[1] > 100;
    shadows(this.key, !airborne);
    shadows(this.coin, !airborne);
    this.pose(this.key, w.key.rot);
    this.coin.position.set(...w.coin.at);
    this.pose(this.coin, w.coin.rot);
    this.coin.scale.setScalar(Math.max(0.001, w.coin.scale));
    this.coin.visible = w.coin.scale > 0.01;

    const alarm = w.alarm > 0.5;
    this.led.color.set(alarm ? 0xff3d3d : 0x33d975);
    const value = w.balance.toFixed(2);
    this.paint(this.display, `${value}|${alarm}`, () => drawDisplay(this.display, this.fonts, value, alarm));

    this.app.position.x = f.app.x;
    this.blobs[1].position.set(f.app.x + APP.depth / 2, 0.2, 0);
    this.paint(this.appScreen, f.app.screen, () => drawApp(this.appScreen, this.fonts, f.app.screen));

    this.drawCable(f);

    const r = f.router;
    this.router.visible = !!r;
    this.blobs[2].visible = !!r;
    if (r) {
      this.router.position.y = 420 * (1 - r.drop);
      this.parts[0].position.x = r.bezel;
      r.layers.forEach((x, i) => (this.parts[i + 1].position.x = x));
      const x0 = r.bezel - 10;
      const x1 = r.layers[r.layers.length - 1] + 26;
      this.setRail(x0, x1);
      this.shell.position.set(ROUTER.closed.bezel + 6 + 30 * r.lift, 620 * r.lift, 0);
      this.shell.rotation.z = -10 * r.lift * DEG;
      this.shell.visible = r.lift < 0.999;
      shadows(this.shell, r.lift < 0.05);
      r.lit.forEach((v, i) => (this.rings[i].opacity = v));
      this.blobs[2].position.set((x0 + x1) / 2, 0.2, 0);
      this.blobs[2].scale.set(Math.max(0.3, (x1 - x0) / 520), 1, 1);
      (this.blobs[2].material as THREE.MeshBasicMaterial).opacity = 0.5 * r.drop;
    }

    this.deposit.visible = !!f.deposit;
    if (f.deposit) {
      this.deposit.position.set(...f.deposit.at);
      // Face along the route, so it passes through each aperture; spin about its own axis.
      this.deposit.rotation.set(0, Math.PI / 2, f.deposit.spin * DEG);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Euler angles in degrees (order YXZ), with yaw measured from facing the camera. */
  private pose(obj: THREE.Object3D, rot: V3) {
    obj.rotation.order = "YXZ";
    obj.rotation.set(rot[0] * DEG, FACING + rot[1] * DEG, rot[2] * DEG);
  }

  private paint(s: Screen, key: string, draw: () => void) {
    if (s.last === key) return;
    s.last = key;
    draw();
    s.tex.needsUpdate = true;
  }

  private setRail(x0: number, x1: number) {
    const len = Math.round(x1 - x0);
    if (len !== this.railLength) {
      this.railLength = len;
      this.rail.geometry.dispose();
      this.rail.geometry = new RoundedBoxGeometry(len, 8, 46, 3, 3);
    }
    this.rail.position.set(x0 + len / 2, 4, 0);
  }

  /** Fits the frame's world box into its focus rectangle, through a long lens. */
  private frameCamera(f: Frame) {
    const { w, h } = this.size;
    const cam = this.camera;
    const [a, b] = f.roi;
    const target = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    const corners: THREE.Vector3[] = [];
    for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) corners.push(new THREE.Vector3(x, y, z));
    const fw = f.focus.x1 - f.focus.x0;
    const fh = f.focus.y1 - f.focus.y0;
    cam.aspect = w / h;
    cam.clearViewOffset();

    const bounds = () => {
      cam.position.copy(target).addScaledVector(VIEW, this.distance);
      cam.lookAt(target);
      cam.near = Math.max(10, this.distance - 3000);
      cam.far = this.distance + 3000;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const v = new THREE.Vector3();
      for (const c of corners) {
        v.copy(c).project(cam);
        const px = ((v.x + 1) / 2) * w;
        const py = ((1 - v.y) / 2) * h;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
      return { x0, y0, x1, y1 };
    };

    let bb = bounds();
    for (let i = 0; i < 4; i++) {
      const s = Math.min(fw / (bb.x1 - bb.x0), fh / (bb.y1 - bb.y0));
      if (Math.abs(s - 1) < 0.002) break;
      this.distance /= s;
      bb = bounds();
    }
    const dx = (bb.x0 + bb.x1) / 2 - (f.focus.x0 + f.focus.x1) / 2;
    const dy = (bb.y0 + bb.y1) / 2 - (f.focus.y0 + f.focus.y1) / 2;
    cam.setViewOffset(w, h, dx, dy, w, h);
    cam.updateMatrixWorld();
  }

  /** The plug flies along its path, the cable trailing it; once in, the cable settles along the floor. */
  private drawCable(f: Frame) {
    const t = f.plug;
    const shown = t > 0.001;
    this.plug.visible = shown;
    this.cable.visible = shown;
    this.requests.forEach((s) => (s.visible = false));
    this.pulse.visible = false;
    if (!shown) return;

    const at = along(PLUG_PATH, t);
    const ahead = along(PLUG_PATH, Math.min(1, t + 0.015));
    const dir = new THREE.Vector3(ahead[0] - at[0], ahead[1] - at[1], ahead[2] - at[2]);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const square = Math.min(1, Math.max(0, (t - 0.82) / 0.16));
    dir.lerp(new THREE.Vector3(0, 0, -1), square * square * (3 - 2 * square)).normalize();
    this.plug.position.set(...at);
    this.plug.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);

    const tail = new THREE.Vector3(-43, 0, 0).applyQuaternion(this.plug.quaternion).add(this.plug.position);
    const settle = Math.min(1, Math.max(0, (t - 0.5) / 0.5));
    const e = settle * settle * (3 - 2 * settle);
    const n = 28;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const flying = along(PLUG_PATH, t * k);
      const lying = along(CABLE_REST, k);
      pts.push(new THREE.Vector3(flying[0] + (lying[0] - flying[0]) * e, flying[1] + (lying[1] - flying[1]) * e, flying[2] + (lying[2] - flying[2]) * e));
    }
    pts[n].copy(tail);
    pts[0].set(APP_PORT[0], APP_PORT[1], APP_PORT[2] + 2);
    const path = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    this.cable.geometry.dispose();
    this.cable.geometry = new THREE.TubeGeometry(path, 140, 3.4, 16, false);

    f.requests.forEach((v, i) => {
      const s = this.requests[i];
      s.visible = true;
      s.position.copy(path.getPointAt(v));
      s.position.y += 4;
    });
    if (f.pulse !== null) {
      this.pulse.visible = true;
      this.pulse.position.copy(path.getPointAt(f.pulse));
      this.pulse.position.y += 4;
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}

// ---- The key's shape ----------------------------------------------------------------------------------------

/** The key's length runs along x; KEY_MID recentres it on its middle. */
const KEY_MID = 30;

function keyOutline() {
  const m = KEY_MID;
  const s = new THREE.Shape();
  // The bow: a softened square with a ring hole, then a shoulder and the blade.
  s.moveTo(10 - m, 19);
  s.lineTo(-13 - m, 19);
  s.absarc(-13 - m, 6, 13, Math.PI / 2, Math.PI, false);
  s.lineTo(-26 - m, -6);
  s.absarc(-13 - m, -6, 13, Math.PI, Math.PI * 1.5, false);
  s.lineTo(10 - m, -19);
  s.lineTo(14 - m, -19);
  s.lineTo(17 - m, -13);
  s.lineTo(17 - m, -9);
  // The bitting: cuts of different depths along the bottom edge.
  const cuts: [number, number][] = [
    [27, -9],
    [30, -4.5],
    [33, -9],
    [39, -9],
    [42, -3],
    [46, -3],
    [49, -9],
    [55, -9],
    [58, -5.5],
    [62, -5.5],
    [65, -9],
    [71, -9],
    [74, -6.5],
    [77, -9],
    [80, -9],
  ];
  for (const [x, y] of cuts) s.lineTo(x - m, y);
  s.lineTo(86 - m, -1.5);
  s.quadraticCurveTo(87 - m, 0.5, 85 - m, 2.5);
  s.lineTo(80 - m, 8);
  s.lineTo(17 - m, 8);
  s.lineTo(17 - m, 13);
  s.lineTo(14 - m, 19);
  s.lineTo(10 - m, 19);
  return s;
}

/** The key's pocket in the foam, in the insert's own coordinates (x, −z). */
function keyPocket([cx, , cz]: V3) {
  const p = new THREE.Path();
  const m = KEY_MID;
  // Key coordinates (x along its length) → world (x = cx + y, z = cz + x) → insert (x, −z).
  const pt = (kx: number, ky: number): [number, number] => [cx + ky, -(cz + kx)];
  const outline: [number, number][] = [
    [12 - m, 22],
    [-15 - m, 22],
    [-29 - m, 8],
    [-29 - m, -8],
    [-15 - m, -22],
    [12 - m, -22],
    [18 - m, -12],
    [84 - m, -12],
    [90 - m, -2],
    [84 - m, 11],
    [18 - m, 11],
  ];
  const first = pt(...outline[0]);
  p.moveTo(first[0], first[1]);
  for (let i = 1; i < outline.length; i++) {
    const [x, y] = pt(...outline[i]);
    p.lineTo(x, y);
  }
  p.lineTo(first[0], first[1]);
  return p;
}
