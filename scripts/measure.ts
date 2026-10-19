// Task 7 report: npm run measure            -> setup times vs. baseline
//                npm run measure -- baseline 6.5 "manual, no Cockpit"
import path from 'node:path';
import {
  createMeasureLog,
  formatReport,
  formatVoiceReport,
} from '../orchestrator/measure.ts';

const dir =
  process.env.COCKPIT_JOURNAL_DIR ??
  path.join(import.meta.dirname, '..', 'journal', 'local');
const log = createMeasureLog(dir);
const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'voice') {
  console.log(formatVoiceReport(await log.readVoiceTurns()));
  process.exit(0);
}
if (cmd === 'baseline') {
  const minutes = Number(rest[0]);
  if (!(minutes > 0 && minutes < 600)) {
    console.error('Usage: npm run measure -- baseline <minutes> [note]');
    process.exit(1);
  }
  const note = rest.slice(1).join(' ') || undefined;
  await log.addBaseline({ at: new Date().toISOString(), minutes, note });
  console.log(`Baseline saved: ${minutes} min${note ? ` (${note})` : ''}.\n`);
} else if (cmd) {
  console.error(
    `Unknown command "${cmd}". Try: npm run measure -- baseline <minutes> [note]`,
  );
  process.exit(1);
}

console.log(formatReport(await log.readTimes(), await log.readBaselines()));
