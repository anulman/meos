// SPDX-License-Identifier: Apache-2.0
// Private SQLite-backed JSON primitive. No provider credentials are logged.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/;
function key(value) { if (typeof value !== 'string' || !KEY.test(value) || value.includes('..')) throw new Error('invalid_store_key'); return value; }
function encode(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw new Error('invalid_store_value');
  return serialized;
}
function checkAncestors(directory) {
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = fs.lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('unsafe_store_path');
  }
}
function privateFile(file) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.geteuid() || (info.mode & 0o777) !== 0o600) throw new Error('unsafe_store_file');
}

/**
 * openCalendarDurableStore({directory}) -> synchronous JSON key/value store.
 * get(key) -> JSON value | undefined; set(key,value); delete(key).
 * transaction(tx => result): synchronous atomic transaction, tx.get/set/delete.
 * acquireLease(key,holder,ttlMs,now=Date.now()) -> {holder,fence,expiresAt}|null.
 * renewLease(key,holder,fence,ttlMs,now), releaseLease(key,holder,fence).
 * JSON values are detached on reads. SQLite serializes cross-process writers;
 * FULL synchronous transactions survive restart, including process death.
 * Lease fences persist across expiration/release and must accompany later work.
 * Callers must NOT perform network work inside transaction callbacks.
 */
export function openCalendarDurableStore({ directory }) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.normalize(directory) !== directory || directory === '/') throw new Error('invalid_store_directory');
  checkAncestors(path.dirname(directory));
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  checkAncestors(directory);
  const info = fs.lstatSync(directory);
  if (info.uid !== process.geteuid() || (info.mode & 0o777) !== 0o700) throw new Error('unsafe_store_directory');
  const file = path.join(directory, 'calendar.sqlite');
  try {
    const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.fsyncSync(fd); fs.closeSync(fd);
    const parent = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    fs.fsyncSync(parent); fs.closeSync(parent);
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  privateFile(file);
  for (const suffix of ['-journal', '-wal', '-shm']) if (fs.existsSync(file + suffix) || fs.lstatSync(file + suffix, { throwIfNoEntry: false })) privateFile(file + suffix);
  const db = new DatabaseSync(file);
  let closed = false, active = false;
  try {
    db.exec('PRAGMA busy_timeout=2000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS leases (key TEXT PRIMARY KEY, holder TEXT NOT NULL, fence INTEGER NOT NULL, expires_at INTEGER NOT NULL);');
  } catch (error) { db.close(); throw error; }
  const read = db.prepare('SELECT value FROM entries WHERE key=?');
  const write = db.prepare('INSERT INTO entries(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const remove = db.prepare('DELETE FROM entries WHERE key=?');
  const leaseRead = db.prepare('SELECT holder,fence,expires_at AS expiresAt FROM leases WHERE key=?');
  const leaseWrite = db.prepare('INSERT INTO leases(key,holder,fence,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET holder=excluded.holder,fence=excluded.fence,expires_at=excluded.expires_at');
  function live() { if (closed) throw new Error('store_closed'); }
  function transaction(callback) {
    live(); if (active) throw new Error('nested_store_transaction');
    db.exec('BEGIN IMMEDIATE'); active = true;
    let usable = true;
    const scoped = () => { if (!usable) throw new Error('transaction_finished'); };
    const tx = Object.freeze({
      get(name) { scoped(); const row = read.get(key(name)); return row ? JSON.parse(row.value) : undefined; },
      set(name, value) { scoped(); write.run(key(name), encode(value)); },
      delete(name) { scoped(); return remove.run(key(name)).changes > 0; },
    });
    try {
      const result = callback(tx);
      if (result && typeof result.then === 'function') { Promise.resolve(result).catch(() => {}); throw new Error('async_store_transaction_forbidden'); }
      db.exec('COMMIT'); return result;
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { usable = false; active = false; }
  }
  function leaseArgs(name, holder, ttlMs, now) {
    key(name); key(holder);
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 3600000 || !Number.isSafeInteger(now + ttlMs)) throw new Error('invalid_lease_time');
  }
  return Object.freeze({
    get(name) { live(); const row = read.get(key(name)); return row ? JSON.parse(row.value) : undefined; },
    set(name, value) { return transaction(tx => tx.set(name, value)); },
    delete(name) { return transaction(tx => tx.delete(name)); },
    transaction,
    acquireLease(name, holder, ttlMs, now = Date.now()) {
      leaseArgs(name, holder, ttlMs, now);
      return transaction(() => {
        const previous = leaseRead.get(name);
        if (previous && previous.expiresAt > now) return null;
        const fence = (previous?.fence ?? 0) + 1;
        if (!Number.isSafeInteger(fence)) throw new Error('lease_fence_exhausted');
        const expiresAt = now + ttlMs;
        leaseWrite.run(name, holder, fence, expiresAt);
        return { holder, fence, expiresAt };
      });
    },
    renewLease(name, holder, fence, ttlMs, now = Date.now()) {
      leaseArgs(name, holder, ttlMs, now);
      return transaction(() => {
        const previous = leaseRead.get(name);
        if (!previous || previous.holder !== holder || previous.fence !== fence || previous.expiresAt <= now) return null;
        const expiresAt = Math.max(previous.expiresAt, now + ttlMs);
        leaseWrite.run(name, holder, fence, expiresAt);
        return { holder, fence, expiresAt };
      });
    },
    releaseLease(name, holder, fence) {
      key(name); key(holder);
      return transaction(() => {
        const previous = leaseRead.get(name);
        if (!previous || previous.holder !== holder || previous.fence !== fence) return false;
        leaseWrite.run(name, '', fence, 0); return true;
      });
    },
    close() { if (active) throw new Error('transaction_active'); if (!closed) { db.close(); closed = true; } },
  });
}
