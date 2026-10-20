// Cockpit · "Holo" companion renderer: a talking 3D hologram head made of
// circuit particles (Tech HUD layout). Ported from the design canvas boards
// "Circuit · Ice / Synapse / Solar". Same API as BloomRenderer, plus
// setLine() so the mouth can shape the sounds of the line being spoken.
// Pure canvas 2D, no dependencies. Colors come only from the palette.
import type { CompanionState } from './bloom';

type RGB = [number, number, number];
type P3 = [number, number, number]; // screen x, screen y, depth z
export type HoloEye = 'iris' | 'spark' | 'ring' | 'glow';
export const HOLO_EYES: HoloEye[] = ['iris', 'spark', 'ring', 'glow'];

const hex = (h: string): RGB => {
  h = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
};
const rgba = (c: RGB, a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const WHITE: RGB = [255, 255, 255];
const ex2 = (a: number, b: number) => Math.exp(-a * a - b * b);
const hsh = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Mouth shapes: [open, width, round]. A letter maps to one of these.
const VIS: Record<string, [number, number, number]> = {
  A: [0.95, 1.0, 0],
  E: [0.38, 1.18, 0],
  I: [0.3, 1.12, 0],
  O: [0.7, 0.72, 1],
  U: [0.32, 0.56, 1],
  M: [0, 0.98, 0],
  F: [0.1, 1.04, 0],
  C: [0.28, 1.0, 0.1],
  R: [0.06, 1.0, 0],
};
const visOf = (ch: string) => {
  const c = (ch || ' ').toLowerCase();
  if (c === 'a') return 'A';
  if (c === 'e') return 'E';
  if (c === 'i' || c === 'y') return 'I';
  if (c === 'o') return 'O';
  if ('uwq'.includes(c)) return 'U';
  if ('mbp'.includes(c)) return 'M';
  if ('fv'.includes(c)) return 'F';
  if (/[a-z]/.test(c)) return 'C';
  return 'R';
};
const CHARS_PER_SEC = 15; // rough speaking rate for lining the mouth up with the words

// Face geometry (param space: y up, v = angle around the head, 0 = front).
const GR = 70; // rows
const GV = 120; // columns
const EW = 0.18, // eye half-width
  EHU = 0.066, // eye upper half-height
  EHL = 0.048, // eye lower half-height
  MW = 0.29; // mouth half-width
const yOf = (r: number) => 1.1 - (r / GR) * 2.46;
const vOf = (c: number) => {
  const s = (c / GV) * 2 - 1;
  return (s < 0 ? -1 : 1) * Math.PI * Math.pow(Math.abs(s), 1.4); // denser at the front
};
const depthA = (z: number) => Math.max(0, Math.min(1, 0.06 + 0.6 * (z + 0.25)));

export class HoloRenderer {
  private raf = 0;
  private last = performance.now();
  private state: CompanionState = 'waiting';
  private voice = 0;
  private sa = 0;
  private A: RGB = [90, 184, 255];
  private B: RGB = [191, 233, 255];
  private C: RGB = [180, 140, 255];
  private TN: RGB = [232, 247, 255];
  private eye: HoloEye = 'iris';
  private line = '';
  private lineAt = 0;
  private mouth = { o: 0.04, w: 1, r: 0, tg: VIS.R, last: 0 };
  private traces: [number, number][][] = [];

  constructor(
    private cv: HTMLCanvasElement,
    private opts: { calm?: boolean } = {},
  ) {
    // Circuit traces: fixed right-angle paths on the face grid (seeded).
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 84; i++) {
      let r = 3 + Math.floor(rnd() * (GR - 6));
      let c = Math.floor(GV * (0.22 + rnd() * 0.56));
      const pts: [number, number][] = [[r, c]];
      let horiz = rnd() < 0.5;
      const turns = 2 + Math.floor(rnd() * 4);
      for (let s = 0; s < turns; s++) {
        const len = (2 + Math.floor(rnd() * 6)) * (rnd() < 0.5 ? -1 : 1);
        if (horiz) c = Math.max(0, Math.min(GV, c + len));
        else r = Math.max(0, Math.min(GR, r + len));
        pts.push([r, c]);
        horiz = !horiz;
      }
      this.traces.push(pts);
    }
  }

  /** accent = main glow, reply = waiting color, third = thinking color; holo = tint + eye style. */
  setPalette(
    accent: string,
    reply: string,
    third: string,
    holo?: { tint?: string; eye?: string },
  ) {
    this.A = hex(accent);
    this.B = hex(reply);
    this.C = hex(third);
    this.TN = hex(holo?.tint ?? reply);
    this.eye = HOLO_EYES.includes(holo?.eye as HoloEye)
      ? (holo!.eye as HoloEye)
      : 'iris';
  }
  setState(s: CompanionState) {
    this.state = s;
  }
  setVoiceLevel(v: number) {
    this.voice = v;
  }
  setCalm(c: boolean) {
    this.opts.calm = c;
  }
  /** The line the companion is saying now (shapes the mouth). */
  setLine(text: string) {
    if (text === this.line) return;
    this.line = text;
    this.lineAt = performance.now();
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
      t = now / 1000 / (calm ? 2.2 : 1);
    // Same voice target as Bloom: real audio while speaking, the mic while listening.
    const target =
      ai === 'speaking'
        ? this.voice
        : ai === 'listening'
          ? this.voice > 0.02
            ? 0.12 + this.voice * 0.8
            : 0.22 + 0.18 * Math.sin(t * 5) * Math.sin(t * 2.3)
          : ai === 'thinking'
            ? 0.12
            : 0.03;
    this.sa += (target - this.sa) * Math.min(1, 0.22 * dt);
    this.voice *= 0.92; // decays between pulses
    const sa = calm ? this.sa * 0.4 : this.sa;
    const col = ai === 'waiting' ? this.B : ai === 'thinking' ? this.C : this.A;
    const HC = col,
      TN = this.TN;
    const mixc = (m: number): RGB => [
      Math.round(HC[0] + (TN[0] - HC[0]) * m),
      Math.round(HC[1] + (TN[1] - HC[1]) * m),
      Math.round(HC[2] + (TN[2] - HC[2]) * m),
    ];
    const dot = (x: number, y: number, r: number, c: RGB, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(WHITE, a));
      g.addColorStop(0.25, rgba(c, a));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.globalCompositeOperation = 'lighter';
    const cx = W / 2,
      cy = W / 2;
    // aura
    const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.495);
    aura.addColorStop(0, rgba(col, 0.2 + sa * 0.25));
    aura.addColorStop(0.4, rgba(col, 0.06 + sa * 0.08));
    aura.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, W, W);

    // ---- mouth: target shape from the letter being spoken, opened by the real voice level
    const M = this.mouth;
    if (ai === 'speaking' && now - M.last > 80) {
      const shape = this.line
        ? VIS[
            visOf(
              this.line.charAt(
                Math.min(
                  this.line.length - 1,
                  Math.floor(((now - this.lineAt) / 1000) * CHARS_PER_SEC),
                ),
              ),
            )
          ]
        : sa > 0.3
          ? VIS.A
          : VIS.C;
      const open = Math.min(1, 0.3 + sa * 1.1);
      M.tg = [shape[0] * open, shape[1], shape[2]];
      M.last = now;
    }
    if (ai !== 'speaking') M.tg = [ai === 'listening' ? 0.03 : 0.05, 1, 0];
    const kk = 1 - Math.exp((-dt * 16.7) / 65);
    M.o += (M.tg[0] - M.o) * kk;
    M.w += (M.tg[1] - M.w) * kk;
    M.r += (M.tg[2] - M.r) * kk;
    const jaw = M.o * 0.085;

    // ---- head pose
    const yaw =
      0.17 * Math.sin(t * 0.42) +
      (ai === 'listening' ? 0.06 * Math.sin(t * 1.4) : 0);
    const pitch =
      0.05 +
      0.045 * Math.sin(t * 0.31) +
      (ai === 'speaking' ? sa * 0.06 * Math.sin(t * 5.5) : 0) +
      (ai === 'thinking' ? -0.06 : 0);
    const roll = ai === 'listening' ? 0.07 : 0.02 * Math.sin(t * 0.47);
    const cyw = Math.cos(yaw),
      syw = Math.sin(yaw),
      cp = Math.cos(pitch),
      sp = Math.sin(pitch),
      cr = Math.cos(roll),
      sr = Math.sin(roll);
    const S = W * 0.29,
      ox = cx,
      oy = cy - W * 0.03;

    const shape = (y: number, v: number): [number, number, number] => {
      let rx: number;
      if (y > 0.15)
        rx = 0.8 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.15) / 0.97, 2)));
      else {
        const tt = (0.15 - y) / 1.42;
        rx =
          0.8 -
          0.4 * Math.pow(tt, 2.1) -
          0.05 * Math.exp(-Math.pow((y + 0.05) / 0.12, 2));
      }
      if (y < -0.98)
        rx *= Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.98) / 0.34, 2)));
      const fr = Math.max(0, Math.cos(v)),
        av = Math.abs(v);
      let x = Math.sin(v) * rx * 0.93;
      let z = Math.cos(v) * rx * (Math.cos(v) > 0 ? 1.02 : 1.15);
      // nose: bridge to a rounded tip, then wings and the tuck under
      const ns = Math.max(0, Math.min(1, (0.04 - y) / 0.5)),
        nsig = 0.062 + 0.07 * ns,
        nprof =
          y > -0.46
            ? 0.25 *
              Math.pow(ns, 1.35) *
              (y < 0.04 ? 1 : Math.exp(-Math.pow((y - 0.04) / 0.05, 2)))
            : 0.25 *
              Math.pow(1, 1.35) *
              Math.exp(-Math.pow((y + 0.46) / 0.075, 2));
      const dz =
        nprof * Math.exp(-Math.pow(v / nsig, 2)) +
        0.07 * ex2((av - 0.132) / 0.056, (y + 0.51) / 0.058) -
        0.03 * ex2((av - 0.205) / 0.024, (y + 0.49) / 0.08) -
        0.02 * ex2((av - 0.07) / 0.05, (y + 0.03) / 0.06) -
        0.15 *
          (ex2((v - 0.37) / 0.17, (y - 0.03) / 0.13) +
            ex2((v + 0.37) / 0.17, (y - 0.03) / 0.13)) -
        0.05 *
          (ex2((v - 0.42) / 0.16, (y + 0.62) / 0.16) +
            ex2((v + 0.42) / 0.16, (y + 0.62) / 0.16)) +
        0.08 *
          Math.exp(-Math.pow((y - 0.17) / 0.07, 2)) *
          Math.exp(-Math.pow(v / 0.55, 2)) +
        0.05 *
          (ex2((v - 0.56) / 0.2, (y + 0.32) / 0.18) +
            ex2((v + 0.56) / 0.2, (y + 0.32) / 0.18)) +
        0.07 * ex2(v / 0.26, (y + 0.77) / 0.06) +
        0.06 * ex2(v / 0.24, (y + 0.86) / 0.06) +
        0.08 * ex2(v / 0.3, (y + 1.13) / 0.11);
      z += dz * fr * fr;
      x += (v > 0 ? 1 : -1) * 0.07 * ex2((av - 1.7) / 0.15, (y + 0.1) / 0.18);
      if (y < -0.81) {
        const k = Math.min(1, (-0.81 - y) / 0.1);
        y -= jaw * k * (0.35 + 0.65 * fr);
      }
      return [x, y * 0.94, z];
    };
    const xf = (p: [number, number, number]): P3 => {
      const [x, y, z] = p;
      const x1 = x * cyw + z * syw,
        z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp,
        z2 = y * sp + z1 * cp;
      const x3 = x1 * cr - y2 * sr,
        y3 = x1 * sr + y2 * cr;
      const f = 4.2 / (4.2 - z2);
      return [ox + x3 * S * f, oy - y3 * S * f, z2];
    };
    const flick = 0.9 + 0.1 * Math.sin(t * 37) * Math.sin(t * 13.3);

    // ---- emitter + light cone
    const by = W * 0.955;
    const cone = ctx.createLinearGradient(0, by, 0, by - W * 0.75);
    cone.addColorStop(0, rgba(HC, 0.2 + sa * 0.15));
    cone.addColorStop(1, rgba(HC, 0));
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.2, by);
    ctx.lineTo(cx + W * 0.2, by);
    ctx.lineTo(cx + W * 0.42, by - W * 0.75);
    ctx.lineTo(cx - W * 0.42, by - W * 0.75);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(
        cx,
        by,
        W * (0.2 + i * 0.05),
        W * (0.026 + i * 0.007),
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = rgba(HC, 0.5 - i * 0.14);
      ctx.lineWidth = 1.4 * dpr;
      ctx.stroke();
    }

    // ---- holes for the eyes and mouth (no particles there)
    const blink = t % 4.6 < 0.13 ? 0.08 : 1;
    const MWd = MW * M.w;
    const prof = (v: number) => {
      const b = Math.max(0, 1 - Math.pow(v / MWd, 2));
      return b * (1 - M.r) + Math.sqrt(b) * M.r;
    };
    const upY = (v: number) => {
      const b = Math.max(0, 1 - Math.pow(v / MWd, 2));
      return -0.795 + 0.01 * b + M.o * 0.024 * prof(v);
    };
    const loY = (v: number) => -0.806 - M.o * 0.11 * prof(v) - 0.003;
    const inHole = (y: number, v: number) => {
      if (Math.abs(v) < MWd && y < upY(v) && y > loY(v)) return true;
      for (const sd of [-1, 1]) {
        const du = (v - sd * 0.37) / EW,
          dy = y - 0.03,
          hh = (dy > 0 ? EHU : EHL) * blink;
        if (du * du + (dy / hh) * (dy / hh) < 1) return true;
      }
      return false;
    };

    // ---- the surface: circuit particles (5 brightness x 4 color buckets)
    const grid: P3[][] = [];
    for (let r = 0; r <= GR; r++) {
      const row: P3[] = [];
      for (let c = 0; c <= GV; c++) row.push(xf(shape(yOf(r), vOf(c))));
      grid.push(row);
    }
    const scanY = 1.1 - ((t * 0.38) % 1) * 2.46;
    const scanB = (y: number) =>
      1 +
      1.4 *
        Math.exp(-Math.pow((y - scanY) / 0.08, 2)) *
        (ai === 'thinking' ? 1.4 : 0.6);
    const buckets: { p: P3; big: boolean }[][] = Array.from(
      { length: 20 },
      () => [],
    );
    const put = (p: P3, al: number, m: number, big = false) => {
      if (al < 0.045) return;
      const ai2 = Math.min(4, Math.floor(Math.min(1, al) * 5)),
        ci2 = Math.max(0, Math.min(3, Math.round(m * 3)));
      buckets[ci2 * 5 + ai2].push({ p, big });
    };
    for (let r = 0; r <= GR; r++) {
      const y = yOf(r),
        sb = scanB(y);
      for (let c = 0; c <= GV; c++) {
        const v = vOf(c);
        if (inHole(y, v)) continue;
        const p = grid[r][c],
          z = p[2];
        if (z < -0.3) continue;
        const h0 = hsh(r, c);
        const al =
          (depthA(z) + 0.5 * Math.exp(-Math.pow(z / 0.09, 2))) * // bright silhouette
          (0.45 + 0.55 * Math.sin(t * (1.6 + h0 * 2.4) + h0 * 40)) * // twinkle
          sb;
        put(
          p,
          al,
          0.5 + 0.5 * Math.sin(y * 2.3 - t * 0.8 + v * 1.1),
          h0 > 0.93,
        );
      }
    }
    // neck
    for (let ni = 0; ni <= 7; ni++) {
      const ny = -1.0 - ni * 0.12;
      for (let nj = 0; nj <= GV; nj += 2) {
        const nv = -Math.PI + (nj / GV) * Math.PI * 2;
        const p = xf([Math.sin(nv) * 0.34, ny, Math.cos(nv) * 0.38 - 0.1]);
        put(p, depthA(p[2]) * 0.45 * (1 - ni / 8), 0.7);
      }
    }
    buckets.forEach((bk, bi) => {
      if (!bk.length) return;
      const a1 = ((bi % 5) + 0.5) / 5,
        cc = mixc(Math.floor(bi / 5) / 3),
        rr = (0.7 + (bi % 5) * 0.32 + sa * 0.4) * dpr;
      ctx.fillStyle = rgba(cc, a1 * 0.16);
      for (const { p, big } of bk) {
        const k = big ? 2.2 : 1;
        ctx.fillRect(
          p[0] - rr * 1.6 * k,
          p[1] - rr * 1.6 * k,
          rr * 3.2 * k,
          rr * 3.2 * k,
        );
      }
      ctx.fillStyle = rgba(cc, Math.min(1, a1 * 1.1));
      for (const { p, big } of bk) {
        const k = big ? 1.8 : 1;
        ctx.fillRect(p[0] - (rr / 2) * k, p[1] - (rr / 2) * k, rr * k, rr * k);
      }
    });

    // ---- circuit traces with data pulses (faster while speaking / thinking)
    this.traces.forEach((tr, ti) => {
      const path: (P3 | null)[] = [];
      for (let k = 1; k < tr.length; k++) {
        const [r4, c4] = tr[k - 1],
          [r5, c5] = tr[k],
          n = Math.max(Math.abs(r5 - r4), Math.abs(c5 - c4));
        for (let m = k === 1 ? 0 : 1; m <= n; m++) {
          const rr = r4 + Math.sign(r5 - r4) * m,
            cc = c4 + Math.sign(c5 - c4) * m;
          path.push(inHole(yOf(rr), vOf(cc)) ? null : grid[rr][cc]);
        }
      }
      const live = path.filter((p): p is P3 => !!p);
      if (live.length < 2) return;
      const al = depthA(live[0][2]) * flick;
      if (al < 0.2) return;
      ctx.beginPath();
      let on = false;
      for (const p of path) {
        if (!p) {
          on = false;
          continue;
        }
        if (on) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        on = true;
      }
      ctx.strokeStyle = rgba(HC, al * 0.18);
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();
      ctx.strokeStyle = rgba(HC, al * 0.6);
      ctx.lineWidth = 0.9 * dpr;
      ctx.stroke();
      [path[0], path[path.length - 1]].forEach((p, end) => {
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p[0], p[1], (end ? 2.6 : 1.8) * dpr, 0, Math.PI * 2);
        if (end) {
          ctx.strokeStyle = rgba(HC, al * 0.95);
          ctx.lineWidth = dpr;
          ctx.stroke();
        } else {
          ctx.fillStyle = rgba(HC, al);
          ctx.fill();
        }
      });
      if (calm) return;
      const speed = 0.3 + sa * 0.9 + (ai === 'thinking' ? 0.6 : 0),
        fr = (t * speed + ti * 0.37) % 1;
      for (let tl = 0; tl < 4; tl++) {
        const p =
          path[Math.floor(Math.max(0, fr - tl * 0.035) * (path.length - 1))];
        if (p)
          dot(p[0], p[1], (tl ? 3 : 5.5) * dpr, TN, al * (tl ? 0.5 / tl : 1));
      }
    });

    // ---- mouth opening (no lips: the dark gap and its edge)
    const poly = (arr: P3[]) => {
      ctx.beginPath();
      arr.forEach((p, i) =>
        i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
      );
    };
    const up: P3[] = [],
      lo: P3[] = [];
    for (let q = 0; q <= 16; q++) {
      const mv = -MWd + (q / 16) * MWd * 2;
      up.push(xf(shape(upY(mv), mv)));
      lo.push(xf(shape(loY(mv), mv)));
    }
    ctx.globalCompositeOperation = 'source-over';
    poly(up);
    for (let q = lo.length - 1; q >= 0; q--) ctx.lineTo(lo[q][0], lo[q][1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,8,14,.88)';
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    poly(up);
    ctx.strokeStyle = rgba(HC, 0.85);
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    poly(lo);
    ctx.stroke();

    // ---- nose outline: wings, nostrils, side lines
    const nxf = (y: number, v: number) => {
      const q = shape(y, v);
      return xf([q[0], q[1], q[2] + 0.012]);
    };
    const npath = (pts: [number, number][]) => {
      ctx.beginPath();
      pts.forEach(([y, v], i) => {
        const p = nxf(y, v);
        if (i) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
      });
    };
    for (const sd of [-1, 1]) {
      const wing: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const a = -0.5 * Math.PI + (i / 12) * 1.25 * Math.PI;
        wing.push([
          -0.505 + Math.sin(a) * 0.065,
          sd * (0.14 + Math.cos(a) * 0.062),
        ]);
      }
      npath(wing);
      ctx.strokeStyle = rgba(HC, 0.5);
      ctx.lineWidth = 1.1 * dpr;
      ctx.stroke();
      npath([
        [-0.565, sd * 0.125],
        [-0.582, sd * 0.075],
        [-0.578, sd * 0.031],
        [-0.566, 0],
      ]);
      ctx.strokeStyle = rgba(HC, 0.42);
      ctx.lineWidth = dpr;
      ctx.stroke();
      const nost: [number, number][] = [];
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        nost.push([
          -0.566 + Math.sin(a) * 0.009,
          sd * (0.07 + Math.cos(a) * 0.026),
        ]);
      }
      npath(nost);
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,8,14,.8)';
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(HC, 0.5);
      ctx.stroke();
      npath([
        [-0.1, sd * 0.062],
        [-0.25, sd * 0.07],
        [-0.4, sd * 0.092],
      ]);
      ctx.strokeStyle = rgba(HC, 0.28);
      ctx.stroke();
    }

    // ---- eyes: everything stays inside the almond (clipped)
    for (const sd of [-1, 1]) {
      const pts: P3[] = [];
      for (let e = 0; e <= 24; e++) {
        const a = (e / 24) * Math.PI * 2,
          sn = Math.sin(a);
        pts.push(
          xf(
            shape(
              0.03 +
                sn *
                  (sn > 0 ? EHU : EHL) *
                  blink *
                  (0.8 + 0.2 * Math.abs(Math.cos(a * 0.5))),
              sd * 0.37 + Math.cos(a) * EW,
            ),
          ),
        );
      }
      const top = xf(shape(0.03 + EHU, sd * 0.37)),
        bot = xf(shape(0.03 - EHL, sd * 0.37)),
        half = Math.abs(bot[1] - top[1]) / 2;
      const lp = xf(shape(0.03, sd * 0.37 - EW)),
        rp = xf(shape(0.03, sd * 0.37 + EW)),
        ew = Math.abs(rp[0] - lp[0]) / 2;
      const gz = yaw * 0.12 + (ai === 'thinking' ? 0.03 : 0),
        gy = ai === 'thinking' ? 0.02 : 0;
      const ic = xf(shape(0.026 + gy, sd * 0.37 - gz));
      const pul = 1 + sa * 0.22 + (ai === 'listening' ? 0.14 : 0);
      ctx.save();
      poly(pts);
      ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,10,18,.9)';
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      if (this.eye === 'iris') {
        dot(ic[0], ic[1], half * 1.5, HC, 0.55);
        const irr = half * 0.86;
        ctx.beginPath();
        ctx.arc(ic[0], ic[1], irr, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(HC, 0.95);
        ctx.lineWidth = half * 0.2;
        ctx.stroke();
        const spin = t * (ai === 'thinking' ? 2.4 : 0.7);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + spin;
          ctx.beginPath();
          ctx.arc(ic[0], ic[1], irr * 0.58, a, a + 0.36);
          ctx.strokeStyle = rgba(TN, 0.85);
          ctx.lineWidth = half * 0.13;
          ctx.stroke();
        }
        const pr = half * 0.24 * pul;
        dot(ic[0], ic[1], pr * 3, HC, 0.9);
        ctx.beginPath();
        ctx.arc(ic[0], ic[1], pr * 0.65, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.fill();
      } else if (this.eye === 'ring') {
        const rr = half * 1.3 * pul,
          g = ctx.createRadialGradient(ic[0], ic[1], 0, ic[0], ic[1], rr);
        g.addColorStop(0, rgba(TN, 0.35));
        g.addColorStop(0.3, rgba(HC, 0.06));
        g.addColorStop(0.5, rgba(HC, 0.75));
        g.addColorStop(0.6, rgba(WHITE, 0.95));
        g.addColorStop(0.72, rgba(HC, 0.8));
        g.addColorStop(1, rgba(HC, 0.08));
        ctx.fillStyle = g;
        ctx.fill();
        dot(ic[0], ic[1], half * 0.3, WHITE, 0.7);
      } else if (this.eye === 'spark') {
        dot(ic[0], ic[1], half * 1.8, HC, 0.45);
        for (let k = 0; k < 18; k++) {
          const a =
              k * 2.39996 +
              t *
                (0.9 + (k % 3) * 0.45) *
                (ai === 'thinking' ? 2.6 : 1) *
                (k % 2 ? 1 : -1),
            r = half * (0.3 + 0.62 * ((k * 0.618) % 1)) * pul;
          dot(
            ic[0] + Math.cos(a) * r * 1.35,
            ic[1] + Math.sin(a) * r,
            half * 0.32,
            k % 4 ? HC : TN,
            0.95,
          );
        }
        dot(ic[0], ic[1], half * 0.55 * pul, WHITE, 0.95);
      } else {
        const g = ctx.createRadialGradient(
          ic[0],
          ic[1],
          0,
          ic[0],
          ic[1],
          Math.max(ew, half * 2.4),
        );
        g.addColorStop(0, rgba([235, 250, 255], ai === 'listening' ? 1 : 0.9));
        g.addColorStop(0.28, rgba(HC, 0.95));
        g.addColorStop(0.7, rgba(HC, 0.45));
        g.addColorStop(1, rgba(HC, 0.12));
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();
      poly(pts);
      ctx.closePath();
      ctx.strokeStyle = rgba(HC, 0.9);
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    // ---- drifting particles in the light cone
    if (!calm)
      for (let i = 0; i < 26; i++) {
        const ph = (t * (0.05 + (i % 5) * 0.012) + i * 0.137) % 1;
        dot(
          cx + Math.sin(i * 12.9) * W * 0.36,
          by - ph * W * 0.85,
          1.8 * dpr,
          HC,
          0.5 * (1 - ph),
        );
      }
  }
}
