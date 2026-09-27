// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openCalendarDurableStore } from '../backend/calendar-durable-store.mjs';

const moduleUrl = new URL('../backend/calendar-durable-store.mjs', import.meta.url).href;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meos-private-store-'));
  const directory = path.join(root, 'store');
  const store = openCalendarDurableStore({ directory });
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { store, directory, root };
}
async function worker(directory, code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import {openCalendarDurableStore} from ${JSON.stringify(moduleUrl)}; const store=openCalendarDurableStore({directory:process.argv[1]}); ${code}`, directory], { stdio: ['ignore', 'ignore', 'pipe'], env: {} });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (status, signal) => resolve({ status, signal, stderr }));
  });
}

test('private durable store survives close/restart with detached JSON and private modes', t => {
  const { store, directory } = fixture(t);
  store.set('oauth:owner', { refreshToken: 'synthetic-only', nested: { generation: 1 } });
  const loaded = store.get('oauth:owner'); loaded.nested.generation = 99;
  assert.equal(store.get('oauth:owner').nested.generation, 1);
  assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(directory, 'calendar.sqlite')).mode & 0o777, 0o600);
  store.close();
  const restarted = openCalendarDurableStore({ directory });
  try { assert.deepEqual(restarted.get('oauth:owner'), { refreshToken: 'synthetic-only', nested: { generation: 1 } }); }
  finally { restarted.close(); }
});
test('private durable store rolls back failed multi-key transaction', t => {
  const { store } = fixture(t);
  store.set('stable', 1);
  assert.throws(() => store.transaction(tx => { tx.set('stable', 2); tx.set('new', 3); throw new Error('injected'); }), /injected/);
  assert.equal(store.get('stable'), 1); assert.equal(store.get('new'), undefined);
  store.transaction(tx => { tx.set('stable', 4); tx.set('new', 5); });
  assert.equal(store.get('stable'), 4); assert.equal(store.delete('new'), true); assert.equal(store.delete('new'), false);
});
test('private durable store forbids async, nested and escaped transactions', async t => {
  const { store } = fixture(t);
  let escaped;
  store.transaction(tx => { escaped = tx; });
  assert.throws(() => escaped.set('late', true), /transaction_finished/);
  assert.throws(() => store.transaction(async tx => { tx.set('early', true); await Promise.resolve(); tx.set('late', true); }), /async_store_transaction_forbidden/);
  await Promise.resolve();
  assert.equal(store.get('early'), undefined); assert.equal(store.get('late'), undefined);
  assert.throws(() => store.transaction(() => store.set('nested', true)), /nested_store_transaction/);
});
test('private durable store rejects traversal keys, unsupported and oversized JSON', t => {
  const { store } = fixture(t);
  for (const name of ['../owner', '/etc/passwd', 'x/../y', '', 'x'.repeat(201), 'a..b']) assert.throws(() => store.set(name, 1), /invalid_store_key/);
  assert.throws(() => store.set('x', undefined), /invalid_store_value/);
  assert.throws(() => store.set('x', 'x'.repeat(4 * 1024 * 1024)), /invalid_store_value/);
  assert.equal(store.get('x'), undefined);
});
test('private durable store fails closed for symlink directories/files and open modes', t => {
  const { root } = fixture(t);
  const actual = path.join(root, 'actual'); fs.mkdirSync(actual, { mode: 0o700 });
  const linked = path.join(root, 'linked'); fs.symlinkSync(actual, linked);
  assert.throws(() => openCalendarDurableStore({ directory: linked }), /unsafe_store_path/);
  assert.throws(() => openCalendarDurableStore({ directory: path.join(linked, 'child') }), /unsafe_store_path/);
  fs.writeFileSync(path.join(root, 'outside'), 'do-not-touch', { mode: 0o600 });
  fs.symlinkSync(path.join(root, 'outside'), path.join(actual, 'calendar.sqlite'));
  assert.throws(() => openCalendarDurableStore({ directory: actual }), /unsafe_store_file/);
  assert.equal(fs.readFileSync(path.join(root, 'outside'), 'utf8'), 'do-not-touch');
  const insecure = path.join(root, 'insecure'); fs.mkdirSync(insecure, { mode: 0o755 });
  assert.throws(() => openCalendarDurableStore({ directory: insecure }), /unsafe_store_directory/);
});
test('private durable store rejects hardlinked database and malicious journal', t => {
  const { root, directory, store } = fixture(t);
  store.close();
  fs.linkSync(path.join(directory, 'calendar.sqlite'), path.join(root, 'duplicate'));
  assert.throws(() => openCalendarDurableStore({ directory }), /unsafe_store_file/);
  fs.unlinkSync(path.join(root, 'duplicate'));
  fs.symlinkSync(path.join(root, 'missing-target'), path.join(directory, 'calendar.sqlite-journal'));
  assert.throws(() => openCalendarDurableStore({ directory }), /unsafe_store_file/);
});
test('private durable store cross-process writers serialize without lost updates', async t => {
  const { store, directory } = fixture(t);
  store.set('count', 0);
  const results = await Promise.all([1, 2].map(() => worker(directory, `for(let i=0;i<30;i++)store.transaction(tx=>tx.set('count',tx.get('count')+1));store.close();`)));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  assert.equal(store.get('count'), 60);
});
test('private durable store recovers uncommitted writer crash without promoting partial state', async t => {
  const { store, directory } = fixture(t);
  store.set('count', 7);
  const result = await worker(directory, `store.transaction(tx=>{tx.set('count',99);tx.set('partial',true);process.kill(process.pid,'SIGKILL')});`);
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(store.get('count'), 7); assert.equal(store.get('partial'), undefined);
  store.set('after', 'recovered'); assert.equal(store.get('after'), 'recovered');
});
test('durable lease expiration recovers worker death and fences old renewal/release', t => {
  const { store, directory } = fixture(t);
  const old = store.acquireLease('sync', 'worker-a', 100, 1000);
  assert.deepEqual(old, { holder: 'worker-a', fence: 1, expiresAt: 1100 });
  assert.equal(store.acquireLease('sync', 'worker-b', 100, 1099), null);
  const second = openCalendarDurableStore({ directory });
  try {
    const fresh = second.acquireLease('sync', 'worker-b', 100, 1100);
    assert.equal(fresh.fence, 2);
    assert.equal(store.renewLease('sync', 'worker-a', 1, 100, 1101), null);
    assert.equal(store.releaseLease('sync', 'worker-a', 1), false);
    assert.deepEqual(second.renewLease('sync', 'worker-b', 2, 200, 1150), { holder: 'worker-b', fence: 2, expiresAt: 1350 });
    assert.equal(second.releaseLease('sync', 'worker-b', 2), true);
    assert.equal(store.acquireLease('sync', 'worker-c', 100, 1200).fence, 3);
  } finally { second.close(); }
});
test('durable leases reject invalid times and closed store never operates', t => {
  const { store } = fixture(t);
  for (const ttl of [0, -1, 3600001, 0.5, NaN]) assert.throws(() => store.acquireLease('sync', 'worker', ttl, 100), /invalid_lease_time/);
  assert.throws(() => store.acquireLease('sync', 'worker', 1, Number.MAX_SAFE_INTEGER), /invalid_lease_time/);
  store.close(); assert.throws(() => store.get('x'), /store_closed/); assert.throws(() => store.set('x', 1), /store_closed/);
});
