# SPDX-License-Identifier: Apache-2.0
import copy
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from setup_inspect import inspect


def ledger(**decisions):
    return {'unrelated': {'keep': True}, 'meosSetup': {'schema': 1, 'decisions': {
        'owner': 'Synthetic owner', 'timezone': 'America/Montreal',
        'hosting': 'Existing verified Linux host', 'access': 'Private phone access',
        'calendar': 'defer', 'authority': 'proposal-only', 'cadence': 'on-demand',
        'eventMessages': 'off', **decisions}, 'components': {}}}


class SetupInspectorTests(unittest.TestCase):
    def test_new_record_and_missing_question_do_not_mutate(self):
        record = {'unrelated': True}
        self.assertEqual(inspect(record)['next']['kind'], 'record')
        self.assertEqual(record, {'unrelated': True})
        record['meosSetup'] = {'schema': 1}
        self.assertEqual(inspect(record)['next']['key'], 'owner')

    def test_ordered_resume_and_all_horizons(self):
        for horizon, skill in [('today', 'meos-morning-launch'), ('tomorrow', 'meos-evening-close'), ('this-week', 'meos-weekly-review'), ('next-week', 'meos-weekly-review')]:
            record = ledger()
            for key in ['application', 'mcp', 'skills']:
                self.assertEqual(inspect(record)['next']['key'], key)
                record['meosSetup']['components'][key] = {'state': 'verified', 'evidence': ['synthetic:receipt']}
            self.assertEqual(inspect(record)['next']['key'], 'horizon')
            record['meosSetup']['decisions']['horizon'] = horizon
            self.assertIn(skill, inspect(record)['next']['procedure'])
            record['meosSetup']['components']['firstPlan'] = {'state': 'verified', 'evidence': ['synthetic:delivered-proposal']}
            result = inspect(record)
            self.assertEqual(result['recordedStatus'], 'verified-in-ledger')
            self.assertEqual(result['liveStatus'], 'not-checked')

    def test_configured_is_not_verified_and_repeats_preserve_ledger(self):
        record = ledger()
        record['meosSetup']['components']['application'] = {'state': 'configured'}
        before = copy.deepcopy(record)
        first = inspect(record)
        self.assertEqual(first['next']['key'], 'application')
        self.assertEqual(first, inspect(record))
        self.assertEqual(record, before)

    def test_optional_delivery_choices_and_component_selection(self):
        record = ledger(cadence='scheduled', calendar='connect', eventMessages='on')
        result = inspect(record)
        self.assertEqual(result['missingDecisions'], ['quietHours', 'delivery'])
        self.assertTrue({'calendar', 'jobs', 'delivery', 'events'} <= set(result['pendingComponents']))
        self.assertFalse({'calendar', 'jobs', 'delivery', 'events'} & set(inspect(ledger())['pendingComponents']))

    def test_verification_and_blockers_require_recorded_evidence(self):
        record = ledger()
        record['meosSetup']['components']['application'] = {'state': 'verified'}
        with self.assertRaises(ValueError):
            inspect(record)
        record['meosSetup']['components']['application'] = {'state': 'blocked', 'blocker': 'No release', 'owner': 'operator', 'nextAction': 'Admit release'}
        self.assertEqual(inspect(record)['next']['key'], 'application')
        self.assertEqual(inspect(record)['next']['recordedNextAction'], 'Admit release')
        self.assertEqual(inspect(record)['components']['application']['state'], 'blocked')
        with self.assertRaises(ValueError):
            inspect(ledger(timezone='Not/A_Timezone'))

    def test_malformed_component_and_schema_are_rejected(self):
        record = ledger()
        record['meosSetup']['schema'] = True
        with self.assertRaises(ValueError):
            inspect(record)
        record['meosSetup']['schema'] = 1
        record['meosSetup']['components']['application'] = {'state': []}
        with self.assertRaises(ValueError):
            inspect(record)

    def test_cli_is_read_only_and_does_not_echo_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'existing-ledger.json'
            record = ledger(owner='DO-NOT-ECHO-SYNTHETIC-OWNER')
            path.write_text(json.dumps(record))
            before = path.read_bytes()
            result = subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name('setup_inspect.py')), '--ledger', str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertNotIn('DO-NOT-ECHO', result.stdout)
            self.assertEqual(path.read_bytes(), before)
            self.assertEqual(list(path.parent.iterdir()), [path])
            path.write_text('{"secret":"DO-NOT-ECHO", bad JSON}')
            result = subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name('setup_inspect.py')), '--ledger', str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn('DO-NOT-ECHO', result.stdout + result.stderr)
            path.write_bytes(('é' * (600 * 1024)).encode())
            result = subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name('setup_inspect.py')), '--ledger', str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
