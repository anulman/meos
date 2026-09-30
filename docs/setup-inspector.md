# Inspect resumable personal setup

Use the read-only host inspector to find the next missing decision or capability
in an existing installation ledger. It runs on Python 3.9 or later with system
IANA timezone data, without MeOS credentials or a network connection. It does not
install MeOS, execute a proposed action, register jobs, or independently verify a
live service.

## Add structure to the existing ledger

Keep the bootstrap procedure's [one completion checklist](../public/skills/meos-bootstrap/SKILL.md#keep-one-completion-checklist).
If that host record is JSON, add a `meosSetup` section; retain all other fields.
Use the host's existing atomic write mechanism. Do not create a parallel ledger
or overwrite the record with this example. For a non-JSON ledger, use the manual
checklist until the host supplies a deliberate migration or adapter.

```json
{
  "meosSetup": {
    "schema": 1,
    "decisions": {
      "owner": "Planner owner",
      "timezone": "America/Montreal",
      "hosting": "Existing verified Linux host",
      "access": "Private phone and browser access",
      "calendar": "defer",
      "authority": "proposal-only",
      "cadence": "on-demand",
      "eventMessages": "off"
    },
    "components": {
      "application": {
        "state": "configured",
        "evidence": ["host-ledger:application-installation"]
      }
    }
  }
}
```

Values above illustrate a manual-assistance choice, not defaults or another
owner's authority. Record the user's actual decisions. Never store tokens or
passwords in the ledger.

## Read the next step

From the pinned checkout, run:

```sh
python3 clients/meos-host/setup_inspect.py --ledger /PRIVATE/existing-ledger.json
```

Replace the path with the existing host record. Output is JSON. Missing setup
structure yields `recordedStatus: "not-started"`; missing decisions produce a
question. Otherwise the inspector reports the first incomplete selected
component and its procedure. A configured application still needs its separate
verification evidence. The command creates no directories or files.

After the responsible agent records progress in that same ledger, rerun the
command. Identical input produces identical output. Following an interruption,
reconcile actual effects before updating the record or retrying a mutation.
A recorded blocker includes its recorded next action and owner; these are ledger
claims, not authority to execute them.

## Decision and component reference

Required decisions are `owner`, `timezone`, `hosting`, `access`, `calendar`,
`authority`, `cadence`, and `eventMessages`. Each value is a nonempty string of
at most 2,000 characters. The timezone must be an installed IANA identifier.
The following choices have fixed values:

| Decision | Values |
| --- | --- |
| `calendar` | `connect`, `defer` |
| `authority` | `proposal-only`, `meos-owned-blocks` |
| `cadence` | `on-demand`, `scheduled` |
| `eventMessages` | `on`, `off` |
| `horizon` | `today`, `tomorrow`, `this-week`, `next-week` |

Proactive assistance also requires `quietHours` and `delivery`, recorded as
nonempty descriptions. On-demand assistance with events off does not require
those decisions. `horizon` is requested after earlier selected setup components
have recorded verification; it routes the first plan to the existing daily or
weekly skill. A disrupted current day can use rescue as described by the
[assistant entry point](../public/skills/meos-assistant/SKILL.md).

The component keys are `application`, `mcp`, `skills`, `calendar`, `jobs`,
`delivery`, `events`, and `firstPlan`. Calendar, jobs, delivery, and events are
selected by the decisions above; the others are always tracked. A missing
component means pending. Optional components remain in the ledger if deferred,
but do not block the selected path.

| State | Meaning and required fields |
| --- | --- |
| `pending` | Work or proof has not been recorded |
| `configured` | Configuration is recorded, not verified execution |
| `verified` | At least one nonempty `evidence` reference is required |
| `blocked` | Nonempty `blocker`, `nextAction`, and `owner` are required |

Evidence references point to non-secret receipts in the same host record system;
the inspector does not dereference them. Preserve the checklist's actual-state,
execution-owner, delivery-route and time-of-check detail in the existing record.
`firstPlan` can reference a delivered proposal when writes are not authorized.
An installed job or saved plan alone is not proof of delivery.

## Interpret completion honestly

When every selected component has recorded verification, the result is
`verified-in-ledger`, with a final handoff action. `liveStatus` remains
`not-checked` for every result: recorded evidence can be stale or incorrect.
Reconcile it with current observations using the
[verification procedure](../public/skills/meos-bootstrap/verify.md), then deliver
the actual result. The inspector does not grant missing authority.

Exit status is `0` for a valid report, including incomplete setup, and `2` for
an unreadable, oversized, malformed, or unsupported ledger. The input limit is
1 MiB; the command does not echo parser excerpts, decision values, or unrelated
ledger fields. Unknown decision/component keys and verified components without
evidence are errors, not silently ignored work.
