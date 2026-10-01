# SPDX-License-Identifier: Apache-2.0
"""Read-only inspection of a meosSetup section in the existing host ledger.

No host execution, network calls, scheduling, credential access or ledger writes.
Recorded verification is not a fresh probe of a live service.
"""
import argparse
import json
import pathlib
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

QUESTIONS = {
    'owner': 'Who owns this planner?',
    'timezone': 'Which local timezone should planning use?',
    'hosting': 'Where will the persistent planner run, including when your laptop is off?',
    'access': 'Which devices need access, and should access be private or public?',
    'calendar': 'Connect Google Calendar now, or explicitly defer it?',
    'authority': 'Proposal-only planning, or permission to manage MeOS-owned blocks within your constraints?',
    'cadence': 'On-demand assistance, or scheduled check-ins?',
    'eventMessages': 'Enable event messages, or keep them off?',
    'quietHours': 'What quiet hours should apply to proactive messages?',
    'delivery': 'Where should proactive messages reach you?',
    'horizon': 'Would you like to talk about today, tomorrow, this week, or next week?',
}
CHOICES = {
    'calendar': {'connect', 'defer'},
    'authority': {'proposal-only', 'meos-owned-blocks'},
    'cadence': {'on-demand', 'scheduled'},
    'eventMessages': {'on', 'off'},
    'horizon': {'today', 'tomorrow', 'this-week', 'next-week'},
}
PROCEDURES = {
    'application': 'application.md', 'mcp': 'application.md',
    'calendar': 'application.md', 'skills': 'agent.md',
    'jobs': 'agent.md', 'delivery': 'verify.md',
    'events': 'events.md', 'firstPlan': 'conversation.md#choose-the-first-planning-horizon',
}
HORIZONS = {'today': 'meos-morning-launch', 'tomorrow': 'meos-evening-close',
            'this-week': 'meos-weekly-review', 'next-week': 'meos-weekly-review'}
STATES = {'pending', 'configured', 'verified', 'blocked'}


def inspect(ledger):
    if not isinstance(ledger, dict):
        raise ValueError('ledger must be an object')
    setup = ledger.get('meosSetup')
    if setup is None:
        return {'recordedStatus': 'not-started', 'liveStatus': 'not-checked',
                'next': {'kind': 'record', 'key': 'meosSetup',
                         'action': 'Add the documented meosSetup section to this existing ledger; do not create another ledger.',
                         'procedure': '/skills/meos-bootstrap/SKILL.md#keep-one-completion-checklist'}}
    if not isinstance(setup, dict) or type(setup.get('schema')) is not int or setup['schema'] != 1:
        raise ValueError('meosSetup.schema must be 1')
    decisions, components = setup.get('decisions', {}), setup.get('components', {})
    if not isinstance(decisions, dict) or not isinstance(components, dict):
        raise ValueError('decisions and components must be objects')
    if set(decisions) - QUESTIONS.keys() or set(components) - PROCEDURES.keys():
        raise ValueError('unknown decision or component key')
    for key, value in decisions.items():
        if not isinstance(value, str) or not value.strip() or len(value) > 2000:
            raise ValueError('decisions must contain nonempty bounded strings')
        if key in CHOICES and value not in CHOICES[key]:
            raise ValueError('unsupported decision choice: ' + key)
    if 'timezone' in decisions:
        try:
            ZoneInfo(decisions['timezone'])
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError('timezone must name an installed IANA timezone') from None
    for key, value in components.items():
        if not isinstance(value, dict) or not isinstance(value.get('state'), str) or value['state'] not in STATES:
            raise ValueError('invalid component state: ' + key)
        evidence = value.get('evidence', [])
        if not isinstance(evidence, list) or any(not isinstance(v, str) or not v.strip() or len(v) > 2000 for v in evidence):
            raise ValueError('evidence must be nonempty reference strings')
        if value['state'] == 'verified' and not evidence:
            raise ValueError('verified component needs evidence references: ' + key)
        if value['state'] == 'blocked' and not all(isinstance(value.get(k), str) and value[k].strip() for k in ['blocker', 'nextAction', 'owner']):
            raise ValueError('blocked component needs blocker, nextAction and owner: ' + key)
    required = ['owner', 'timezone', 'hosting', 'access', 'calendar', 'authority', 'cadence', 'eventMessages']
    proactive = decisions.get('cadence') == 'scheduled' or decisions.get('eventMessages') == 'on'
    if proactive:
        required += ['quietHours', 'delivery']
    selected = ['application', 'mcp', 'skills']
    if decisions.get('calendar') == 'connect':
        selected.append('calendar')
    if decisions.get('cadence') == 'scheduled':
        selected.append('jobs')
    if proactive:
        selected.append('delivery')
    if decisions.get('eventMessages') == 'on':
        selected.append('events')
    selected.append('firstPlan')
    missing = [key for key in required if key not in decisions]
    pending = [key for key in selected if components.get(key, {}).get('state') != 'verified']
    result = {'recordedStatus': 'incomplete', 'liveStatus': 'not-checked',
              'missingDecisions': missing, 'pendingComponents': pending,
              'components': {key: {'state': components.get(key, {}).get('state', 'pending'),
                                   'evidenceCount': len(components.get(key, {}).get('evidence', []))} for key in selected}}
    if missing:
        key = missing[0]
        result['next'] = {'kind': 'question', 'key': key, 'question': QUESTIONS[key],
                          'procedure': '/skills/meos-bootstrap/conversation.md'}
    elif pending and (pending[0] != 'firstPlan' or components.get(pending[0], {}).get('state') == 'blocked'):
        key = pending[0]
        result['next'] = {'kind': 'component', 'key': key,
                          'action': 'Reconcile the recorded blocker and next owner/action in the ledger.' if components.get(key, {}).get('state') == 'blocked' else 'Resume this component and record its separate verification evidence.',
                          'procedure': '/skills/meos-bootstrap/' + PROCEDURES[key]}
        if components.get(key, {}).get('state') == 'blocked':
            result['next']['recordedBlocker'] = components[key]['blocker']
            result['next']['recordedNextAction'] = components[key]['nextAction']
            result['next']['recordedOwner'] = components[key]['owner']
    elif 'horizon' not in decisions:
        result['missingDecisions'].append('horizon')
        result['next'] = {'kind': 'question', 'key': 'horizon', 'question': QUESTIONS['horizon'],
                          'procedure': '/skills/meos-bootstrap/conversation.md#choose-the-first-planning-horizon'}
    elif pending:
        result['next'] = {'kind': 'plan', 'key': 'firstPlan',
                          'procedure': '/skills/' + HORIZONS[decisions['horizon']] + '/SKILL.md',
                          'action': 'Plan the chosen horizon within recorded authority; preserve unknown actuals and verify authorized effects.'}
    else:
        result['recordedStatus'] = 'verified-in-ledger'
        result['next'] = {'kind': 'handoff', 'procedure': '/skills/meos-bootstrap/verify.md',
                          'action': 'Reconcile recorded evidence with current runtime, then deliver the result and remaining limitations.'}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ledger', required=True, type=pathlib.Path)
    args = parser.parse_args()
    try:
        with args.ledger.open('rb') as source:
            raw = source.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError('ledger exceeds 1 MiB')
        result = inspect(json.loads(raw))
    except (OSError, ValueError) as error:
        # Do not echo the ledger, answers, credentials, or JSON parser excerpts.
        print(json.dumps({'error': 'ledger-unavailable-or-invalid', 'type': type(error).__name__}))
        return 2
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
