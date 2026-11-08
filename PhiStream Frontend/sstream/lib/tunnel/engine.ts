/**
 * TunnelEngine — framework-free Three.js r160 scene.
 * 1:1 port of the preview's WebGL code into a clean class.
 *
 * Rules (§2 Phase 2):
 * - No window/document access at import time.
 * - Math.random() call ORDER preserved (dust first, then sparks; 4 randoms per point).
 * - Every magic number is from the preview — do not tidy them.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from "three";
import { CARD_SPECS, type CardSpec } from "./cards";
import { COUNT, INTRO_END, OUTRO_START, clamp, serviceCoord, smooth } from "./timeline";

const TAU = Math.PI * 2;

export type TunnelOptions = {
  canvas: HTMLCanvasElement;
  /** Resolved CSS font-family string (next/font hashes the family name — read it from the DOM). */
  fontFamily: string;
  /** Called every rendered frame with the SMOOTHED progress p (0..1). Drives captions. */
  onFrame?: (p: number) => void;
  /** Called once, after the first frame has been drawn. */
  onFirstFrame?: () => void;
};

const INK = "#14213D";
const CARD_W = 1024;
const CARD_H = 640;

type Ctx = CanvasRenderingContext2D;

function wrap(x: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (line && x.measureText(t).width > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Per-service illustration, drawn around (cx, cy) in a box about 340 px square. */
const ART: ((x: Ctx, cx: number, cy: number, ac: string, fg: string, bg: string) => void)[] = [
  // 01 identity: the φ mark inside a design-tool selection box
  (x, cx, cy, ac, fg) => {
    x.save();
    x.strokeStyle = fg; x.globalAlpha = 0.5; x.lineWidth = 2; x.setLineDash([8, 8]);
    x.strokeRect(cx - 150, cy - 170, 300, 340);
    x.beginPath(); x.moveTo(cx - 172, cy); x.lineTo(cx + 172, cy); x.moveTo(cx, cy - 200); x.lineTo(cx, cy + 200); x.stroke();
    x.setLineDash([]); x.globalAlpha = 1; x.fillStyle = fg;
    for (const [px, py] of [[-150, -170], [150, -170], [-150, 170], [150, 170]]) x.fillRect(cx + px - 7, cy + py - 7, 14, 14);
    x.strokeStyle = ac; x.lineWidth = 18; x.lineCap = "round";
    x.beginPath(); x.ellipse(cx, cy, 82, 100, 0, 0, TAU); x.stroke();
    x.beginPath(); x.moveTo(cx, cy - 150); x.lineTo(cx, cy + 150); x.stroke();
    x.restore();
  },
  // 02 funnel: attention in, one paying customer out
  (x, cx, cy, ac, fg) => {
    x.save();
    const layers: [number, number, number, number][] = [[-110, -35, 300, 210], [-35, 40, 210, 130], [40, 115, 130, 60]];
    layers.forEach(([y0, y1, w0, w1], i) => {
      x.fillStyle = fg; x.globalAlpha = 0.14 + i * 0.1;
      x.beginPath();
      x.moveTo(cx - w0 / 2, cy + y0); x.lineTo(cx + w0 / 2, cy + y0);
      x.lineTo(cx + w1 / 2, cy + y1 - 4); x.lineTo(cx - w1 / 2, cy + y1 - 4);
      x.closePath(); x.fill();
    });
    x.globalAlpha = 1; x.fillStyle = fg;
    for (const [px, py] of [[-120, -165], [-70, -150], [-20, -172], [35, -155], [90, -168], [130, -148], [-95, -128], [10, -130], [75, -125]]) {
      x.beginPath(); x.arc(cx + px, cy + py, 7, 0, TAU); x.fill();
    }
    x.strokeStyle = ac; x.lineWidth = 6; x.lineCap = "round"; x.setLineDash([2, 14]);
    x.beginPath(); x.moveTo(cx, cy + 115); x.lineTo(cx, cy + 150); x.stroke(); x.setLineDash([]);
    x.fillStyle = ac; x.beginPath(); x.arc(cx, cy + 172, 24, 0, TAU); x.fill();
    x.fillStyle = INK; x.font = "700 30px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("$", cx, cy + 173);
    x.restore();
  },
  // 03 monetization: rising bars with a trend line
  (x, cx, cy, ac, fg, bg) => {
    x.save();
    const hs = [60, 95, 135, 185, 245];
    hs.forEach((h, i) => {
      x.fillStyle = i === hs.length - 1 ? ac : fg; x.globalAlpha = i === hs.length - 1 ? 1 : 0.3 + i * 0.1;
      x.fillRect(cx - 160 + i * 68, cy + 150 - h, 48, h);
    });
    x.globalAlpha = 1; x.strokeStyle = fg; x.lineWidth = 4; x.beginPath(); x.moveTo(cx - 180, cy + 156); x.lineTo(cx + 180, cy + 156); x.stroke();
    x.strokeStyle = ac; x.lineWidth = 8; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); hs.forEach((h, i) => { const px = cx - 136 + i * 68, py = cy + 120 - h; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke();
    x.fillStyle = ac; x.beginPath(); x.arc(cx - 130, cy - 130, 40, 0, TAU); x.fill();
    x.fillStyle = bg; x.font = "700 46px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("$", cx - 130, cy - 128);
    x.restore();
  },
  // 04 content: a video frame, a timeline and a strip of takes
  (x, cx, cy, ac, fg) => {
    x.save();
    x.strokeStyle = fg; x.lineWidth = 6; x.beginPath(); x.roundRect(cx - 165, cy - 150, 330, 186, 18); x.stroke();
    x.fillStyle = ac; x.beginPath(); x.moveTo(cx - 22, cy - 94); x.lineTo(cx - 22, cy - 20); x.lineTo(cx + 42, cy - 57); x.closePath(); x.fill();
    x.fillStyle = fg; x.globalAlpha = 0.3; x.fillRect(cx - 165, cy + 66, 330, 10);
    x.globalAlpha = 1; x.fillStyle = ac; x.fillRect(cx - 165, cy + 66, 190, 10);
    x.beginPath(); x.arc(cx + 25, cy + 71, 13, 0, TAU); x.fill();
    for (let i = 0; i < 4; i++) { x.fillStyle = fg; x.globalAlpha = 0.18 + i * 0.06; x.beginPath(); x.roundRect(cx - 165 + i * 85, cy + 108, 75, 48, 8); x.fill(); }
    x.restore();
  },
  // 05 operations: a hub wired to its parts, each checked off
  (x, cx, cy, ac, fg) => {
    x.save();
    const sat: [number, number][] = [[-135, -105], [135, -105], [-135, 105], [135, 105]];
    x.strokeStyle = fg; x.globalAlpha = 0.6; x.lineWidth = 4;
    sat.forEach(([px, py]) => { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + px, cy + py); x.stroke(); });
    x.globalAlpha = 1; x.strokeStyle = ac; x.lineWidth = 6; x.setLineDash([4, 12]); x.lineCap = "round";
    x.beginPath(); x.arc(cx, cy, 66, 0, TAU); x.stroke(); x.setLineDash([]);
    x.fillStyle = ac; x.beginPath(); x.arc(cx, cy, 40, 0, TAU); x.fill();
    sat.forEach(([px, py]) => {
      x.fillStyle = fg; x.beginPath(); x.roundRect(cx + px - 38, cy + py - 38, 76, 76, 16); x.fill();
      x.strokeStyle = INK; x.lineWidth = 9; x.lineJoin = "round";
      x.beginPath(); x.moveTo(cx + px - 17, cy + py); x.lineTo(cx + px - 4, cy + py + 14); x.lineTo(cx + px + 19, cy + py - 13); x.stroke();
    });
    x.restore();
  },
  // 06 scaling: steps up, an arrow riding them
  (x, cx, cy, ac, fg) => {
    x.save();
    [70, 125, 190, 260].forEach((h, i) => {
      x.fillStyle = i === 3 ? ac : fg; x.globalAlpha = i === 3 ? 1 : 0.22 + i * 0.1;
      x.fillRect(cx - 170 + i * 86, cy + 150 - h, 78, h);
    });
    x.globalAlpha = 1; x.strokeStyle = fg; x.lineWidth = 9; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.moveTo(cx - 160, cy + 30); x.lineTo(cx - 70, cy - 20); x.lineTo(cx + 10, cy - 75); x.lineTo(cx + 120, cy - 150); x.stroke();
    x.fillStyle = fg; x.beginPath(); x.moveTo(cx + 146, cy - 170); x.lineTo(cx + 92, cy - 160); x.lineTo(cx + 128, cy - 120); x.closePath(); x.fill();
    x.restore();
  },
];

/** Paints one service card face onto a fresh canvas. */
export function drawCard(c: CardSpec, i: number, font: string): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = CARD_W; cv.height = CARD_H;
  const x = cv.getContext("2d")!;
  // Each card keeps the same dark foundation while its accent changes.
  const ac = c.ac;

  x.fillStyle = c.bg; x.fillRect(0, 0, CARD_W, CARD_H);
  const glow = x.createRadialGradient(CARD_W * 0.78, CARD_H * 0.3, 20, CARD_W * 0.78, CARD_H * 0.3, CARD_W * 0.6);
  glow.addColorStop(0, "rgba(255,255,255,0.12)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = glow; x.fillRect(0, 0, CARD_W, CARD_H);
  const shade = x.createLinearGradient(0, CARD_H * 0.55, 0, CARD_H);
  shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,0.22)");
  x.fillStyle = shade; x.fillRect(0, 0, CARD_W, CARD_H);
  x.strokeStyle = c.fg; x.globalAlpha = 0.06; x.lineWidth = 1;
  for (let g = 64; g < CARD_W; g += 64) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, CARD_H); x.stroke(); }
  for (let g = 64; g < CARD_H; g += 64) { x.beginPath(); x.moveTo(0, g); x.lineTo(CARD_W, g); x.stroke(); }
  x.globalAlpha = 1;

  x.strokeStyle = ac; x.lineWidth = 5; x.strokeRect(18, 18, CARD_W - 36, CARD_H - 36);
  x.globalAlpha = 0.35; x.lineWidth = 2; x.strokeRect(34, 34, CARD_W - 68, CARD_H - 68); x.globalAlpha = 1;

  // divider between the copy and the artwork
  x.fillStyle = c.fg; x.globalAlpha = 0.18; x.fillRect(612, 90, 2, CARD_H - 180); x.globalAlpha = 1;

  ART[i](x, 800, 330, ac, c.fg, c.bg);

  x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.fillStyle = ac; x.font = `500 44px ${font}`; x.fillText(c.n, 68, 112);
  x.globalAlpha = 0.55; x.fillStyle = c.fg; x.font = `400 30px ${font}`; x.fillText("/ 06", 132, 112); x.globalAlpha = 1;
  x.fillStyle = ac; x.fillRect(68, 136, 72, 5);

  x.fillStyle = c.fg; x.font = `500 66px ${font}`;
  const title = wrap(x, c.title, 510);
  title.forEach((t, k) => x.fillText(t, 68, 226 + k * 72));
  const ly = 226 + (title.length - 1) * 72 + 62;
  x.globalAlpha = 0.85; x.font = `400 32px ${font}`;
  wrap(x, c.line, 510).slice(0, 2).forEach((t, k) => x.fillText(t, 68, ly + k * 42));
  x.globalAlpha = 1;

  // deliverable chips, shrunk until the row fits
  const gap = 12, pad = 18;
  const rowW = (f: number) => { x.font = `500 ${f}px ${font}`; return c.tags.reduce((a, t) => a + x.measureText(t).width + pad * 2, 0) + gap * 2; };
  let fs = 26;
  while (fs > 20 && rowW(fs) > 520) fs--;
  x.font = `500 ${fs}px ${font}`;
  let px = 68;
  x.lineWidth = 2.5;
  for (const t of c.tags) {
    const w = x.measureText(t).width + pad * 2;
    x.strokeStyle = ac; x.beginPath(); x.roundRect(px, 516, w, 52, 26); x.stroke();
    x.fillStyle = c.fg; x.fillText(t, px + pad, 516 + 35);
    px += w + gap;
  }

  return cv;
}

function cardTexture(c: CardSpec, i: number, font: string, aniso: number): CanvasTexture {
  const tx = new CanvasTexture(drawCard(c, i, font));
  tx.colorSpace = SRGBColorSpace;
  tx.anisotropy = aniso;
  return tx;
}

/**
 * Scroll timeline (p = 0..1). The logo stands alone and the ring of cards spins out of it until
 * INTRO_END; the six services then share the span to OUTRO_START, one card in focus at a time;
 * after that the ring folds back into the logo for the closing call to action.
 */
const STEP = TAU / COUNT;
/** Where the focused card rests on the ring (radians from facing the camera): front-left, so the
 *  logo stays clear in the middle and the caption has the right-hand side. */
const SLOT = -0.52;
/** On a phone the focused card rests dead ahead, large, below the logo (see PORT below). */
const SLOT_PORT = 0;
/**
 * Portrait (phone) composition. A phone is tall and narrow, so the desktop layout
 * (focus card to one side of the logo) shrinks the cards to a quarter of the
 * width and their text becomes unreadable. Instead the ring is tilted toward the
 * viewer: the focused card dips in front of and below the logo and fills most of
 * the width, neighbours peek in from either side, and the far side of the ring
 * rises behind the logo.
 */
const PORT = {
  radius: 3.6,
  tilt: 0.5,         // radians the ring leans toward the camera
  cardScale: 1,      // focus card ends up 1.3x: about 80% of the screen width
  logoScale: 0.8,
  logoLift: 1.4,     // the logo rides up as the ring opens, so the focus card has room below it
  camZ: 9,
  camBack: 3.2,
  camY: 0.6,
  lookY: -1.2,
};

/** Ring rotation (in cards) for a focus coordinate: advances steadily but lingers on each card. */
function ringTurn(q: number): number {
  const n = Math.floor(q);
  const f = q - n;
  return n + f * 0.08 + smooth(0.35, 0.65, f) * 0.92;
}

export class TunnelEngine {
  private R: WebGLRenderer;
  private S = new Scene();
  private cam = new PerspectiveCamera(40, 1, 0.1, 80);
  private logo: Group;
  private cards: Mesh[] = [];
  private rings: Line[] = [];
  private dust: Points;
  private sparks: Points;
  private owned: { dispose(): void }[] = [];

  private pr: number;
  private port = false;
  private target = 0;
  private sp = 0;
  private raf = 0;
  private running = false;
  private lastT = 0;
  private frames = 0;
  private acc = 0;
  private first = true;
  private w = 1;
  private h = 1;

  constructor(private o: TunnelOptions) {
    // throws if WebGL is unavailable — caller catches and shows the static hero
    this.R = new WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true });
    this.pr = Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.75 : 1.5);
    this.R.toneMapping = ACESFilmicToneMapping;
    this.R.setClearColor(0, 0);
    // the camera sits ~12 from the logo, so only the far side of the ring and the dust fade
    this.S.fog = new Fog(0x14213d, 13, 30);

    // ── studio environment (PMREM from a small emissive scene) ──
    // A gradient dome plus softboxes: polished gold is only as good as what it reflects, and
    // a near-black room made it read as brown. HDR values (>1) give the highlights real punch.
    const E = new Scene();
    const dome = new SphereGeometry(20, 48, 32);
    const pos = dome.getAttribute("position");
    const cols = new Float32Array(pos.count * 3);
    const top = new Color(0xffe0c8).multiplyScalar(1.5);
    const mid = new Color(0x24375d);
    const low = new Color(0x081329);
    const tmp = new Color();
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getY(i) / 20;
      (u > 0 ? tmp.copy(mid).lerp(top, Math.pow(u, 0.7)) : tmp.copy(mid).lerp(low, Math.pow(-u, 0.7))).toArray(cols, i * 3);
    }
    dome.setAttribute("color", new BufferAttribute(cols, 3));
    E.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
    ([
      [0, 9, 0, 14, 0.3, 14, 0xffffff, 2.2],     // overhead softbox
      [-9, 2, 3, 0.3, 9, 6, 0xffe2a8, 1.8],      // warm key strip, left
      [9, 1, -3, 0.3, 9, 6, 0xffffff, 2.8],      // cool-white strip, right
      [0, 1, 11, 12, 6, 0.3, 0xfff1d6, 0.9],     // front fill (what a face-on φ reflects)
      [0, -4, 6, 12, 0.3, 6, 0xe9b44c, 2.2],     // warm floor bounce
    ] as const).forEach(([x, y, z, w, h, d, c, k]) => {
      const m = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color: new Color(c).multiplyScalar(k) }));
      m.position.set(x, y, z);
      E.add(m);
    });
    const pm = new PMREMGenerator(this.R);
    const envRT = pm.fromScene(E, 0.03);
    this.S.environment = envRT.texture;
    pm.dispose();
    E.traverse((n) => { const m = n as Mesh; m.geometry?.dispose(); (m.material as MeshBasicMaterial | undefined)?.dispose(); });
    this.owned.push(envRT);

    // ── lights ──
    const dl = new DirectionalLight(0xffffff, 0.85);
    dl.position.set(3, 5, 6);
    const rim = new DirectionalLight(0xffe2a8, 0.55);
    rim.position.set(-4, 1, -5);
    this.S.add(dl, rim, new AmbientLight(0xffffff, 0.18));

    // ── dust and sparks, drifting in a shell around the logo ──  (Math.random call ORDER matters for QA seeding)
    const shellPt = (): [number, number, number] => {
      const r = 3 + Math.random() * 11, a = Math.random() * TAU, b = Math.acos(2 * Math.random() - 1);
      return [r * Math.sin(b) * Math.cos(a), r * Math.cos(b) * 0.7, r * Math.sin(b) * Math.sin(a)];
    };
    const pts = (n: number, color: number, size: number, opacity: number) => {
      const P = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) P.set(shellPt(), i * 3);
      const G = new BufferGeometry();
      G.setAttribute("position", new BufferAttribute(P, 3));
      const M = new PointsMaterial({ color, size, transparent: true, opacity });
      this.owned.push(G, M);
      return new Points(G, M);
    };
    this.dust = pts(650, 0xf4ede0, 0.035, 0.7);
    this.sparks = pts(100, 0xe9b44c, 0.06, 0.9);
    this.S.add(this.dust, this.sparks);

    // ── two thin gold tracks, above and below the cards ──
    this.rings = [-1.25, 1.25].map((y) => {
      const v: Vector3[] = [];
      for (let i = 0; i <= 160; i++) v.push(new Vector3(Math.sin((i / 160) * TAU), y, Math.cos((i / 160) * TAU)));
      const G = new BufferGeometry().setFromPoints(v);
      const M = new LineBasicMaterial({ color: 0xe9b44c, transparent: true, opacity: 0 });
      this.owned.push(G, M);
      const l = new Line(G, M);
      this.S.add(l);
      return l;
    });

    // ── six service cards ──
    const aniso = Math.min(8, this.R.capabilities.getMaxAnisotropy());
    const plane = new PlaneGeometry(3, 1.875);
    this.owned.push(plane);
    CARD_SPECS.forEach((spec, i) => {
      const tx = cardTexture(spec, i, o.fontFamily, aniso);
      const M = new MeshBasicMaterial({ map: tx, side: DoubleSide, toneMapped: false, transparent: true, opacity: 0 });
      this.owned.push(tx, M);
      const m = new Mesh(plane, M);
      m.visible = false;
      this.S.add(m);
      this.cards.push(m);
    });

    // ── logo ──
    const logoTexture = new TextureLoader().load("/phi-mark.webp");
    const logoMaterial = new MeshBasicMaterial({
      map: logoTexture, color: 0xe39a68, transparent: true,
      side: DoubleSide, toneMapped: false,
    });
    const logoGeometry = new PlaneGeometry(2.2, 2.2);
    this.owned.push(logoTexture, logoMaterial, logoGeometry);
    this.logo = new Group();
    this.logo.add(new Mesh(logoGeometry, logoMaterial));
    this.S.add(this.logo);
  }

  /* ───────── public API ───────── */

  resize(w: number, h: number) {
    this.w = Math.max(1, w); this.h = Math.max(1, h);
    this.port = this.h > this.w;
    this.cam.aspect = this.w / this.h;
    this.cam.fov = this.port ? 64 : 40;
    this.cam.updateProjectionMatrix();
    this.R.setPixelRatio(this.pr);
    this.R.setSize(this.w, this.h, false);       // false: CSS controls the canvas box
  }

  setTarget(p: number) { this.target = clamp(p); }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = 0;
    const loop = (ms: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(ms * 0.001);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  dispose() {
    this.stop();
    this.owned.forEach((d) => d.dispose());
    this.R.dispose();
    this.R.forceContextLoss();
  }

  /* ───────── internals ───────── */

  /** Quality guard: only reduce secondary details when sustained frame time is high. */
  private guard(dt: number) {
    if (this.frames >= 120) return;
    if (this.frames > 0) this.acc += dt;
    this.frames++;
    if (this.frames === 120 && this.acc / 119 > 0.045) {
      this.pr = Math.min(this.pr, 1.25);
      this.rings.forEach((l) => (l.visible = false));
      this.sparks.visible = false;
      this.resize(this.w, this.h);
    }
  }

  private frame(t: number) {
    const dt = this.lastT ? Math.min(0.1, t - this.lastT) : 1 / 60;
    this.lastT = t;
    this.guard(dt);

    // sp += (target - sp) * 0.08 per frame, frame-rate independent (identical at 60 fps).
    this.sp += (this.target - this.sp) * (1 - Math.pow(1 - 0.08, dt * 60));
    const p = this.sp;
    const port = this.port;

    const radius = port ? PORT.radius : 4.7;
    const slot = port ? SLOT_PORT : SLOT;
    const bloom = smooth(0.03, 0.19, p);                              // ring spins out of the logo
    const fold = smooth(OUTRO_START - 0.03, OUTRO_START + 0.09, p);   // and folds back into it
    const open = bloom * (1 - fold);
    const turn = ringTurn(Math.min(serviceCoord(p) - 0.5, COUNT - 1));   // stops on the last card

    // service cards: a ring around the logo, facing outward; the focused one rests at `slot`
    this.cards.forEach((m, i) => {
      const th = slot + (i - turn) * STEP;
      const r = radius * open;
      const front = smooth(-0.3, 0.6, Math.cos(th));                  // far side of the ring is dim
      const focus = smooth(0.84, 0.99, Math.cos(th - slot));
      // dead ahead of the lens; on a phone the focus card rests there, so it is never see-through
      const centre = port ? 0 : smooth(0.3, 0, Math.abs(Math.atan2(Math.sin(th), Math.cos(th))));
      const y0 = ((i % 3) - 1) * 0.1 + Math.sin(t * 0.8 + i) * 0.07;
      // a phone's ring leans toward the viewer: front dips, far side rises
      const y = port ? y0 * Math.cos(PORT.tilt) - Math.cos(th) * r * Math.sin(PORT.tilt) : y0;
      m.position.set(Math.sin(th) * r * (port ? 1 : 1.15), y, Math.cos(th) * r);
      m.rotation.y = th;
      m.scale.setScalar((port ? PORT.cardScale : 1) * (0.8 + 0.5 * focus) * (0.4 + 0.6 * open));
      const M = m.material as MeshBasicMaterial;
      M.opacity = (0.1 + 0.9 * front) * open * (1 - 0.55 * centre);   // see-through while crossing the φ
      M.color.setScalar(0.55 + 0.45 * focus);
      m.visible = M.opacity > 0.003;
    });
    this.rings.forEach((l) => {
      l.scale.set(radius * (port ? 1 : 1.15) * Math.max(0.01, open), 1, radius * Math.max(0.01, open));
      (l.material as LineBasicMaterial).opacity = 0.3 * open;
      l.rotation.y = turn * STEP;
      l.rotation.x = port ? PORT.tilt : 0;
    });

    // the φ stays put, rocking gently; it grows a little for the closing
    const close = smooth(OUTRO_START - 0.02, 1, p);
    this.logo.scale.setScalar((port ? PORT.logoScale : 0.72) * (1 + 0.3 * close));
    this.logo.position.y = port ? PORT.logoLift * open : 0;
    this.logo.rotation.y = Math.sin(t * 0.5) * 0.35 + turn * 0.12;
    this.logo.rotation.x = Math.sin(t * 0.37) * 0.05;
    this.dust.rotation.y = t * 0.02 + p * 0.9;
    this.sparks.rotation.y = t * 0.03 - p * 0.6;

    // camera: starts close on the φ, eases back to take in the ring
    const back = smooth(0, INTRO_END, p);
    const z = (port ? PORT.camZ : 9.6) + back * (port ? PORT.camBack : 2.9);
    this.cam.position.set(Math.sin(t * 0.3) * 0.25, port ? PORT.camY : 0.8, z);
    this.cam.lookAt(0, port ? PORT.lookY : -0.8, 0);

    this.R.render(this.S, this.cam);
    this.o.onFrame?.(p);
    if (this.first) { this.first = false; this.o.onFirstFrame?.(); }
  }
}
