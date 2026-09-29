import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { usdc } from "@/components/story-stage";

/*
 * The debugger's token: the story's USDC coin, alone in a small canvas. It starts as a blank and
 * spins into the token once the debugger has read it, then idles with a slow sway while on screen.
 * It renders only while something moves.
 */

export type Face = "blank" | "token";

/** A token other than USDC, struck as its initial on its colour. */
export type Mint = { letter: string; color: string };

const TURN = Math.PI * 2;

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return { c, ctx: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const easeOut = (t: number) => 1 - (1 - t) ** 4;

/** A token's face: its initial inside a ring, raised in white on its colour (or, for `relief`, as a height map). */
function letter(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sans: string, mint: Mint, relief: boolean) {
  ctx.save();
  ctx.fillStyle = relief ? "#5c5c5c" : mint.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TURN);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.78, 0, TURN);
  ctx.stroke();
  ctx.font = `800 ${Math.round(r * 0.86)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(mint.letter, cx, cy + r * 0.06);
  ctx.restore();
}

export class CoinStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(20, 1, 10, 2000);
  private coin = new THREE.Group();
  private disc: THREE.Mesh;
  private rim: THREE.Material;
  private faces: Record<Face, THREE.Material>;
  private disposables: { dispose(): void }[] = [];
  private face: Face = "blank";
  private raf = 0;
  private live = false;
  /** An identity change in progress: when it began, the angle it began from, and what it turns into. */
  private spin: { start: number; from: number; to: Face; swapped: boolean } | null = null;
  private angle = 0;
  private size = { w: 1, h: 1 };

  constructor(canvasEl: HTMLCanvasElement, sans: string, mint: Mint | null = null) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.035).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.7;
    room.dispose();
    pmrem.dispose();

    // A key light from the upper left, and a cool rim behind so the edge reads against the dark.
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(-120, 160, 220);
    const rimLight = new THREE.DirectionalLight(0xdfe8ff, 1.1);
    rimLight.position.set(160, 40, -140);
    this.scene.add(key, rimLight, new THREE.HemisphereLight(0xffffff, 0x303036, 0.25));

    // The token's face: enamel with raised marks, as in the story.
    const strike = (ctx: CanvasRenderingContext2D, relief: boolean) =>
      mint ? letter(ctx, 512, 512, 440, sans, mint, relief) : usdc(ctx, 512, 512, 440, sans, relief);
    const f = canvas(1024);
    f.ctx.fillStyle = mint?.color ?? "#2775ca";
    f.ctx.fillRect(0, 0, 1024, 1024);
    strike(f.ctx, false);
    const faceMap = texture(f.c);
    const b = canvas(1024);
    b.ctx.fillStyle = "#5c5c5c";
    b.ctx.fillRect(0, 0, 1024, 1024);
    strike(b.ctx, true);
    const faceBump = texture(b.c, false);
    for (const t of [faceMap, faceBump]) {
      // The cap's UVs run sideways; turn the art upright.
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }

    // The blank: a turned gunmetal disc with fine concentric rings, waiting to be identified.
    const r = canvas(512);
    r.ctx.fillStyle = "#808080";
    r.ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
      r.ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
      r.ctx.lineWidth = 1.5;
      r.ctx.beginPath();
      r.ctx.arc(256, 256, 30 + i * 2.5, 0, TURN);
      r.ctx.stroke();
    }
    r.ctx.strokeStyle = "rgba(0,0,0,0.5)";
    r.ctx.lineWidth = 6;
    r.ctx.beginPath();
    r.ctx.arc(256, 256, 214, 0, TURN);
    r.ctx.stroke();
    const blankBump = texture(r.c, false);

    const reed = canvas(512);
    reed.c.height = 8;
    for (let x = 0; x < 512; x += 8) {
      reed.ctx.fillStyle = "#b0b0b0";
      reed.ctx.fillRect(x, 0, 4, 8);
      reed.ctx.fillStyle = "#505050";
      reed.ctx.fillRect(x + 4, 0, 4, 8);
    }
    const reedMap = texture(reed.c, false);
    reedMap.wrapS = THREE.RepeatWrapping;
    reedMap.repeat.set(5, 1);

    this.faces = {
      token: new THREE.MeshPhysicalMaterial({
        map: faceMap,
        bumpMap: faceBump,
        bumpScale: 2.4,
        roughness: 0.5,
        metalness: 0.05,
        clearcoat: 0.18,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.3,
      }),
      blank: new THREE.MeshPhysicalMaterial({
        color: 0x4a4b50,
        metalness: 0.9,
        roughness: 0.34,
        bumpMap: blankBump,
        bumpScale: 1.1,
        clearcoat: 0.25,
        clearcoatRoughness: 0.3,
      }),
    };
    this.rim = new THREE.MeshStandardMaterial({ color: 0xdfe0e2, roughness: 0.22, metalness: 1, bumpMap: reedMap, bumpScale: 1.4, envMapIntensity: 1.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xe0e1e3, roughness: 0.2, metalness: 1, envMapIntensity: 1.4 });

    const body = new THREE.CylinderGeometry(30, 30, 5.4, 128, 1);
    const edge = new THREE.TorusGeometry(29, 1.5, 20, 128);
    this.disc = new THREE.Mesh(body, [this.rim, this.faces.blank, this.faces.blank]);
    this.disc.rotation.x = Math.PI / 2;
    for (const z of [2.7, -2.7]) {
      const lip = new THREE.Mesh(edge, steel);
      lip.position.z = z;
      this.coin.add(lip);
    }
    this.coin.add(this.disc);
    this.coin.rotation.order = "YXZ";
    this.scene.add(this.coin);

    this.disposables.push(env, faceMap, faceBump, blankBump, reedMap, this.faces.token, this.faces.blank, this.rim, steel, body, edge);

    this.camera.position.set(0, 0, 212);
    this.camera.lookAt(0, 0, 0);
  }

  setSize(w: number, h: number) {
    this.size = { w, h };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  /** Shows the coin as a blank or as its token; with `animate`, it spins into the new face. */
  show(face: Face, animate: boolean) {
    if (face === this.face && !this.spin) return;
    if (!animate) {
      this.spin = null;
      this.setFace(face);
      this.request();
      return;
    }
    this.spin = { start: performance.now(), from: this.angle, to: face, swapped: face === this.face };
    this.request();
  }

  /** While on screen, the coin keeps a slow sway; off screen it rests. */
  setLive(on: boolean) {
    this.live = on;
    if (on) this.request();
  }

  private setFace(face: Face) {
    this.face = face;
    this.disc.material = [this.rim, this.faces[face], this.faces[face]];
  }

  private request() {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    const sway = Math.sin(now / 1900) * 0.32;
    let angle = sway;
    if (this.spin) {
      // Two full turns, landing face-on; the face changes while the coin is edge-on.
      const t = Math.min(1, (now - this.spin.start) / 1300);
      const turned = easeOut(t) * TURN * 2;
      angle = this.spin.from + turned + (sway - this.spin.from) * t;
      if (!this.spin.swapped && turned >= Math.PI / 2) {
        this.setFace(this.spin.to);
        this.spin.swapped = true;
      }
      if (t >= 1) this.spin = null;
    }
    this.angle = angle;
    this.coin.rotation.y = angle;
    this.coin.rotation.x = -0.2 + Math.sin(now / 2600) * 0.05;
    this.renderer.render(this.scene, this.camera);
    if (this.spin || this.live) this.request();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
