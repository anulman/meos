# SPDX-License-Identifier: Apache-2.0
import pathlib, sqlite3, tempfile, unittest
from unittest.mock import patch
import owner_alert as a


class OwnerAlertTests(unittest.TestCase):
    def test_events_are_operator_only_and_health_alerts_retain_receipts(self):
        with tempfile.TemporaryDirectory() as folder:
            queue = pathlib.Path(folder) / 'queue.sqlite'
            outbox = sqlite3.connect(queue)
            outbox.execute('CREATE TABLE events(id TEXT, state TEXT)')
            outbox.execute('INSERT INTO events VALUES(?, ?)', ('a'*48, 'blocked_unknown'))
            outbox.commit()
            before = list(outbox.execute('SELECT * FROM events'))
            ledger = sqlite3.connect(pathlib.Path(folder) / 'alerts.sqlite')
            a.initialize(ledger)
            healthy = lambda unit: dict(LoadState='loaded', ActiveState='active', Result='success', NRestarts='0')
            with patch.object(a, 'private', side_effect=lambda p: pathlib.Path(p).absolute()):
                facts = a.discover(queue, healthy, 'boot')
            self.assertEqual(facts, ['event:'+'a'*48])
            forbidden = lambda *args: self.fail('per-event Telegram send')
            a.deliver(ledger, {}, facts, forbidden)
            self.assertEqual(ledger.execute('SELECT count(*) FROM alerts').fetchone()[0], 0)
            calls = []
            def send(config, key, text):
                calls.append(text)
                return dict(provider='telegram', chatId='123', messageId='456')
            config = dict(deliveryTarget='telegram:123')
            a.deliver(ledger, config, facts + ['service:worker:boot'], send)
            self.assertEqual(len(calls), 1)
            self.assertNotIn('event:', calls[0])
            self.assertIn('service:worker:boot', calls[0])
            ledger.close()
            ledger = sqlite3.connect(pathlib.Path(folder) / 'alerts.sqlite')
            a.initialize(ledger)
            a.deliver(ledger, config, facts + ['service:worker:boot'], forbidden)
            self.assertEqual(ledger.execute('SELECT state FROM alerts').fetchone()[0], 'confirmed')
            self.assertEqual(list(outbox.execute('SELECT * FROM events')), before)
            ledger.close(); outbox.close()

    def test_unknown_health_delivery_is_not_replayed(self):
        db = sqlite3.connect(':memory:'); a.initialize(db)
        def fail(*args): raise TimeoutError()
        with self.assertRaises(RuntimeError):
            a.deliver(db, {}, ['monitor:outbox-unreadable:boot'], fail)
        a.initialize(db)
        a.deliver(db, {}, ['monitor:outbox-unreadable:boot'], lambda *args: self.fail('replay'))
        self.assertEqual(db.execute('SELECT state FROM alerts').fetchone()[0], 'unknown')
        db.close()
