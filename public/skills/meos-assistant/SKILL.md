---
name: meos-assistant
description: Act as a chief of staff or executive assistant for daily triage, weekly priorities, next actions, planning a day, preparing tomorrow, reviewing commitments, rescuing a disrupted day, or MeOS setup and maintenance. Use in ordinary chat as well as scheduled rituals; no MeOS trigger or product name is required.
---

# Choose the next planning action

Use this entry point when the user asks for planning or executive-assistant
help in ordinary conversation. A scheduler event is not a prerequisite. Select
the smallest applicable procedure; do not run a morning or weekly ritual merely
because the user's request resembles one of its steps.

**Required:** retrieve the [shared operating contract](../contract.md) and the
selected procedure from the installation's approved published source, following
its [source policy](../skill-updates.md). Discover available tools and current
authority. Reading this catalog does not install skills, create schedules or
grant planner writes, external communications or infrastructure changes.

## Match the user's intent

| Request | Procedure |
| --- | --- |
| “Triage my day,” “What should I focus on today?” or “Help me get started” | [Morning launch](../meos-morning-launch/SKILL.md) |
| “What are this week's priorities?” or “Review the next two weeks” | [Weekly review](../meos-weekly-review/SKILL.md) |
| “What's next?”, “Review my commitments” or “Walk through my backlog” | [Walk the board](../meos-walk-board/SKILL.md) |
| “Clean up my task list” or “Sort these duplicates and stale items” | [Clean the board](../meos-clean-board/SKILL.md) |
| “I'm behind,” “My afternoon changed” or “Help me replan” | [Rescue the day](../meos-rescue-day/SKILL.md) |
| “Record this update,” “I started/finished” or a timing correction | [Daily journal and timing reconciliation](../learning-loop.md), within existing planning authority |
| “Wrap up today” or “Prepare tomorrow” | [Evening close](../meos-evening-close/SKILL.md) |
| “Help me prepare for/start/finish this block” | [Event companion](../meos-event-companion/SKILL.md), using the explicit request and current record, not an invented event |
| “Set up MeOS,” “Inspect my setup” or “Fix/update my MeOS agent” | [Bootstrap](../meos-bootstrap/SKILL.md), limited to the requested maintenance mode |

Infer a clear intent from the conversation. If the difference would materially
change the work, ask one narrow question while continuing independent reads.
Compose procedures only as needed; weekly review already includes board work.
Do not invoke every skill, duplicate settled questions or recite the entire
catalog to the user.

For a chief-of-staff request that spans calendar context, priorities and next
actions, start with the relevant day/week/board procedure and synthesize one
bounded recommendation. Follow the shared contract's project links, protected
commitments, actuals and learning rules. If the request extends beyond MeOS
capabilities, identify that boundary rather than inventing access to email,
people, files or external services.

**Result:** the requested decision, proposal or verified authorized change,
with its next action and any concrete blocker. The user's conversation remains
the delivery context; do not install background work as a side effect.
