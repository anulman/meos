#!/usr/bin/python3
# SPDX-License-Identifier: Apache-2.0
"""Bounded pipeline health alerts; per-event reconciliation stays in the outbox."""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import sqlite3
import stat
import subprocess
import sys

from handling import send_message
from mcp_bridge import private

UNITS = ('meos-agent.service', 'meos-agent-private-tls.service',
         'meos-dispatch-worker.service')
MAX_BLOCKED = 256


def discover(queue, inspect, boot):
    # mode=ro preserves dispatcher ownership; do not call its status/connect.
    facts = set()
    try:
        db = sqlite3.connect(private(queue).as_uri() + '?mode=ro', uri=True)
        try:
            db.execute('PRAGMA query_only=ON')
            rows = db.execute("SELECT id FROM events WHERE state LIKE 'blocked_%' "
                              "ORDER BY id LIMIT ?", (MAX_BLOCKED + 1,)).fetchall()
        finally:
            db.close()
    except (OSError, ValueError, sqlite3.Error):
        rows = []
        facts.add('monitor:outbox-unreadable:' + boot)
    if len(rows) > MAX_BLOCKED:
        facts.add('monitor:blocked-scan-capacity-256-additional-rows-omitted:' + boot)
    for (identity,) in rows[:MAX_BLOCKED]:
        if not isinstance(identity, str) or not re.fullmatch('[a-f0-9]{48}', identity):
            facts.add('monitor:malformed-blocked-event-id:' + boot)
            continue
        facts.add('event:' + identity)
    for unit in UNITS:
        try:
            props = inspect(unit)
            if props.get('LoadState') != 'loaded':
                raise ValueError('expected installed unit absent')
            restarts = int(props['NRestarts'])
        except (OSError, ValueError, KeyError, subprocess.SubprocessError):
            facts.add('monitor:unit-unreadable:' + unit + ':' + boot)
            continue
        # These are required long-running units. During deliberate maintenance,
        # stop this timer; do not silently treat a stopped pipeline as healthy.
        if (props.get('ActiveState') != 'active' or
                props.get('Result') not in ('success', '') or
                restarts > 0):
            # One actionable incident per unit/boot, not one per restart loop.
            facts.add('service:' + unit + ':' + boot)
    # Surface capacity/corruption/service incidents in the first bounded batch.
    return sorted(facts, key=lambda fact: (fact.startswith('event:'), fact))


def inspect_unit(unit):
    result = subprocess.run(['/usr/bin/systemctl', 'show', unit,
                             '--property=LoadState,ActiveState,Result,NRestarts'],
                            check=True, capture_output=True, text=True, timeout=10,
                            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)


def initialize(db):
    db.execute('PRAGMA synchronous=FULL')
    db.execute('CREATE TABLE IF NOT EXISTS alerts '
               '(fact TEXT PRIMARY KEY, batch TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT)')
    # A crash before/after provider acceptance is never permission to replay.
    with db:
        db.execute("UPDATE alerts SET state='unknown' WHERE state='intent'")


def deliver(db, config, facts, send=send_message):
    # Event diagnostics remain in dispatcher journald and the retained outbox.
    # Do not turn each unknown outcome into an interruption of the owner's chat.
    pending = [f for f in facts if not f.startswith('event:') and not db.execute(
        'SELECT 1 FROM alerts WHERE fact=?', (f,)).fetchone()][:20]
    if not pending:
        return
    batch = hashlib.sha256(json.dumps(pending).encode()).hexdigest()
    with db:
        db.executemany('INSERT INTO alerts VALUES(?,?,?,NULL)',
                       [(f, batch, 'intent') for f in pending])
    message = ('MeOS requires reconciliation. Do not replay unknown deliveries. '
               'Inspect retained outbox/service receipts:\n' + '\n'.join(pending))
    try:
        receipt = send(config, 'owner-alert:' + batch, message)
        if (not isinstance(receipt, dict) or receipt.get('provider') != 'telegram' or
                not receipt.get('messageId') or
                str(receipt.get('chatId')) != config['deliveryTarget'].removeprefix('telegram:')):
            raise ValueError('unverified receipt')
    except Exception:
        with db:
            db.execute("UPDATE alerts SET state='unknown' WHERE batch=?", (batch,))
        # No error body/token or event payload enters logs.
        raise RuntimeError('owner alert outcome unknown; reconcile without replay') from None
    with db:
        db.execute("UPDATE alerts SET state='confirmed',receipt=? WHERE batch=?",
                   (json.dumps(receipt), batch))


def main(config_path):
    os.umask(0o077)
    config = json.loads(private(config_path).read_text())
    if set(config) != {'workerConfig', 'queue', 'stateDir'}:
        raise ValueError('invalid configuration')
    worker = json.loads(private(config['workerConfig']).read_text())
    if (worker['hookHost'] not in ('127.0.0.1', '::1') or
            not re.fullmatch(r'telegram:-?[0-9]+', worker['deliveryTarget'])):
        raise ValueError('fixed private owner route required')
    state = pathlib.Path(config['stateDir']).absolute()
    info = state.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('private preinstalled state directory required')
    lock = state / 'lock'
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    private(lock)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        target = state / 'alerts.sqlite'
        if target.exists() or target.is_symlink():
            private(target)
        db = sqlite3.connect(target)
        private(target)
        try:
            initialize(db)
            directory = os.open(state, os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
            boot = pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()
            if not re.fullmatch('[a-f0-9-]{36}', boot):
                raise ValueError('invalid boot identity')
            deliver(db, worker, discover(config['queue'], inspect_unit, boot))
        finally:
            db.close()
    finally:
        os.close(fd)


if __name__ == '__main__':
    main(sys.argv[1])
