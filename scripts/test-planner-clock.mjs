import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Use the installed TS7 compiler; it does not expose the old transpileModule API.
const output = await mkdtemp(join(tmpdir(), 'meos-planner-test-'));
let compiled;
try {
  execFileSync(fileURLToPath(new URL('../node_modules/.bin/tsc', import.meta.url)), [
    '--ignoreConfig', '--outDir', output, '--strict', '--skipLibCheck', '--target', 'ES2022',
    '--module', 'ESNext', '--moduleResolution', 'Bundler', '--jsx', 'react-jsx',
    fileURLToPath(new URL('../src/lib/planner-clock.tsx', import.meta.url)),
  ]);
  compiled = await readFile(join(output, 'planner-clock.js'), 'utf8');
} finally {
  await rm(output, { recursive: true, force: true });
}
for (const module of ['react', 'react/jsx-runtime', './dates', './config', '../../backend/scheduling.mjs']) {
  const resolved = module === './dates' ? new URL('../src/lib/dates.ts', import.meta.url).href : module==='./config'?new URL('../src/lib/config.ts',import.meta.url).href:module==='../../backend/scheduling.mjs'?new URL('../backend/scheduling.mjs',import.meta.url).href:import.meta.resolve(module);
  compiled = compiled.replaceAll(`from '${module}'`, `from '${resolved}'`).replaceAll(`from "${module}"`, `from "${resolved}"`);
}
const { selectedWeekPeriod, projectScheduledTasks, projectRoutineOccurrences } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

assert.deepEqual(selectedWeekPeriod('2024-12-31', 1, 'next'), { start: '2025-01-06', end: '2025-01-12' });
assert.deepEqual(selectedWeekPeriod('2025-01-05', 0, 'this'), { start: '2025-01-05', end: '2025-01-11' });
const period = Object.freeze({ start: '2023-12-31', end: '2023-12-31' });
const task = { id: 'timed', schedule: { date: '2024-01-01', time: '00:30', timezone: 'Asia/Tokyo' } };
const tasks = [task, { id: 'floating', schedule: { date: '2023-12-31', timezone: 'Asia/Tokyo' } },
  { id: 'archived', archived: true, schedule: { date: '2023-12-31', timezone: 'UTC' } }, { id: 'unscheduled' }];
for (const schedule of [
  { date: '2023-12-31', time: '', timezone: 'UTC' },
  { date: '2023-12-31', time: '25:00', timezone: 'UTC' },
  { date: '2023-02-30', time: '12:00', timezone: 'UTC' },
  { date: '2023-12-31', time: '12:00', timezone: 'invalid/zone' },
  { date: '2023-12-31', time: '12:00' },
]) tasks.push({ id: 'invalid', completed: true, priority: 'high', schedule });
const before = JSON.stringify(tasks);
const result = projectScheduledTasks(tasks, period, 'America/Los_Angeles');
assert.deepEqual(result.map(item => item.task.id), ['timed']);
assert.equal(result[0].displayDate, '2023-12-31');
assert.equal(new Date(result[0].instant).toISOString(), '2023-12-31T15:30:00.000Z');
assert.equal(result.length, 1, 'Legacy untimed tasks must not become Anytime agenda entries');
assert.equal(JSON.stringify(tasks), before, 'Projection must not mutate schedule intent');
assert.deepEqual(projectScheduledTasks([task], period, 'Asia/Tokyo'), []);
const routine = { id: 'routine', weekdays: [1], time: '00:30', timezone: 'Asia/Tokyo' };
const completions = [{ routineId: 'routine', date: '2024-01-01', completed: true },
  { routineId: 'other', date: '2024-01-01', completed: false }];
const projected = projectRoutineOccurrences([routine], completions, period, 'America/Los_Angeles');
assert.equal(projected.length, 1);
assert.equal(projected[0].date, '2024-01-01');
assert.equal(projected[0].displayDate, '2023-12-31');
assert.equal(projected[0].completed, true);
assert.equal(projectRoutineOccurrences([routine], [{ routineId: 'routine', date: '2023-12-31', completed: true }], period,
  'America/Los_Angeles')[0].completed, false, 'Display-date completion must not complete a different occurrence');
assert.deepEqual(projectRoutineOccurrences([{ ...routine, archived: true }], completions, period, 'America/Los_Angeles'), []);
console.log('Planner projection checks passed: week selection, immutable schedules, untimed exclusion, occurrence identity, archived exclusion.');
