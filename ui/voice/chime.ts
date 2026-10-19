// A short, soft two-note chime: "I heard the wake word, go ahead."
let ctx: AudioContext | null = null;

export function chime(volume = 0.8) {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const t0 = ctx.currentTime + 0.01;
  const level = Math.max(0.05, Math.min(1, volume)) * 0.18;
  [660, 990].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = t0 + i * 0.09;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.25);
  });
}
