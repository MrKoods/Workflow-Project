// Cockpit · "Bloom" companion renderer (ported from docs/reference/bloom.ts, unchanged).
// A bright core with ~30 light filaments. Speaking: filaments extend with the voice level.
// Listening: they curl inward. Thinking: they swirl. Waiting ("your move"): calm, reply color.
// Pure canvas 2D, no dependencies. Call setState()/setVoiceLevel() from the app; it animates itself.

export type CompanionState =
  | 'waiting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'working';
type RGB = [number, number, number];

const hex = (h: string): RGB => {
  h = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
};
const rgba = (c: RGB, a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

export class BloomRenderer {
  private raf = 0;
  private last = performance.now();
  private state: CompanionState = 'waiting';
  private voice = 0; // 0..1 target, set from TTS amplitude (Phase 1) or typed-text pulses (now)
  private sa = 0; // smoothed voice level
  private rings: { r: number; a: number; dir: number }[] = [];
  private A: RGB = [125, 227, 255];
  private B: RGB = [198, 255, 138];
  private C: RGB = [177, 140, 255];

  constructor(
    private cv: HTMLCanvasElement,
    private opts: { calm?: boolean } = {},
  ) {}

  setPalette(core: string, reply: string, third: string) {
    this.A = hex(core);
    this.B = hex(reply);
    this.C = hex(third);
  }
  setState(s: CompanionState) {
    this.state = s;
  }
  setVoiceLevel(v: number) {
    this.voice = v;
  } // call on every audio frame / text tick
  setCalm(c: boolean) {
    this.opts.calm = c;
  }
  start() {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }

  private frame(now: number) {
    const cv = this.cv,
      dpr = Math.min(2, window.devicePixelRatio || 1),
      W = Math.round((cv.clientWidth || 360) * dpr);
    if (cv.width !== W) {
      cv.width = W;
      cv.height = W;
    }
    const ctx = cv.getContext('2d')!;
    const dt = Math.min(50, now - this.last) / 16.7;
    this.last = now;
    const ai = this.state,
      calm = !!this.opts.calm,
      t = now / 1000;
    let spd =
      (
        {
          thinking: 2.6,
          working: 1.5,
          speaking: 1.1,
          listening: 0.7,
          waiting: 0.45,
        } as Record<string, number>
      )[ai] ?? 0.5;
    if (calm) spd *= 0.3;
    const target =
      ai === 'speaking'
        ? this.voice
        : ai === 'listening'
          ? 0.22 + 0.18 * Math.sin(t * 5) * Math.sin(t * 2.3)
          : ai === 'thinking'
            ? 0.12
            : 0.03;
    this.sa += (target - this.sa) * 0.22 * dt;
    this.voice *= 0.92; // decays between pulses
    const sa = calm ? this.sa * 0.4 : this.sa;
    const { A, B, C } = this;
    const col = ai === 'waiting' ? B : ai === 'thinking' ? C : A;
    const cx = W / 2,
      cy = W / 2,
      R = W * 0.25 * (1 + sa * 0.08);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.globalCompositeOperation = 'lighter';
    const dot = (x: number, y: number, r: number, c: RGB, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba([255, 255, 255], a));
      g.addColorStop(0.25, rgba(c, a));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // aura (clamped so it never shows a square edge)
    const g = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      Math.min(W * 0.495, R * (1.9 + sa * 0.4)),
    );
    g.addColorStop(0, rgba(col, 0.32 + sa * 0.35));
    g.addColorStop(0.35, rgba(col, 0.1 + sa * 0.12));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);

    // voice rings: outward while speaking, inward while listening
    if (!calm) {
      if (
        (ai === 'speaking' && sa > 0.2 && Math.random() < 0.18 * dt) ||
        (ai === 'listening' && Math.random() < 0.05 * dt)
      )
        this.rings.push({
          r: ai === 'listening' ? R * 2.2 : R * 1.05,
          a: 0.55,
          dir: ai === 'listening' ? -1 : 1,
        });
      this.rings = this.rings.filter((rg) => {
        rg.r += rg.dir * 2.2 * dpr * dt;
        rg.a -= 0.012 * dt;
        return rg.a > 0 && rg.r > R * 0.6 && rg.r < W * 0.5;
      });
      for (const rg of this.rings) {
        ctx.beginPath();
        ctx.arc(cx, cy, rg.r, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(col, rg.a * 0.5);
        ctx.lineWidth = 1.4 * dpr;
        ctx.stroke();
      }
    }

    // filaments
    const NT = 30,
      curl = ai === 'listening' ? 0.9 : ai === 'thinking' ? 0.45 : 0.25,
      swirl = ai === 'thinking' ? t * 1.6 : t * 0.25 * spd;
    for (let i = 0; i < NT; i++) {
      const base = (i / NT) * Math.PI * 2 + swirl,
        nz =
          0.5 + 0.5 * Math.sin(i * 2.3 + t * 9) * Math.sin(i * 0.9 - t * 5.5);
      const len =
        R *
        (0.95 + 0.18 * Math.sin(t * 1.3 + i) + sa * 0.9 * nz) *
        (ai === 'listening' ? 0.82 : 1);
      const bend =
        curl * Math.sin(t * 1.7 + i * 0.6) + (ai === 'listening' ? 0.6 : 0);
      const r0 = R * 0.34,
        x0 = cx + Math.cos(base) * r0,
        y0 = cy + Math.sin(base) * r0;
      const mx = cx + Math.cos(base + bend * 0.5) * (r0 + len * 0.55),
        my = cy + Math.sin(base + bend * 0.5) * (r0 + len * 0.55);
      const ex = cx + Math.cos(base + bend) * (r0 + len),
        ey = cy + Math.sin(base + bend) * (r0 + len);
      const cc = i % 3 === 0 ? C : i % 3 === 1 ? col : B;
      const gl = ctx.createLinearGradient(x0, y0, ex, ey);
      gl.addColorStop(0, rgba(cc, 0.7 + sa * 0.3));
      gl.addColorStop(1, rgba(cc, 0.05));
      ctx.strokeStyle = gl;
      ctx.lineWidth = (1.4 + sa * 2.2) * dpr;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      dot(ex, ey, (3 + 4 * nz * (0.4 + sa)) * dpr, cc, 0.35 + sa * 0.5);
    }
    // core
    dot(cx, cy, R * (0.62 + sa * 0.35), col, 0.55 + sa * 0.4);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.3 * (1 + sa * 0.25), 0, Math.PI * 2);
    ctx.strokeStyle = rgba([255, 255, 255], 0.35 + sa * 0.5);
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    dot(cx, cy, R * 0.22 * (1 + sa * 0.6), [255, 255, 255], 0.7 + sa * 0.3);
  }
}

// Until real TTS exists, drive the voice level from the caption typewriter:
//   on each 2-character tick: renderer.setVoiceLevel(/[ ,.?!]/.test(ch) ? 0.18 : 0.45 + Math.random() * 0.55)
// Phase 1: replace with the TTS audio RMS (0..1) sampled ~30x/second.
