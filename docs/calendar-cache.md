# Cached Calendar context

Calendar polling already stores Google snapshots durably in the private Calendar
service. The browser previously read that cache over a separate Calendar RPC and
started its own refresh loop. It did not fetch Google directly.

The existing worker now mirrors credential-free events into owner-scoped records
in the main application database. It does not add a provider poller. Main-app
collections preload this cache with tasks and routine instances; the normal query
refresh updates it without depending on Calendar RPC for reads. Managed edits
still use the existing private service and Google-wins outbox. Primary events
remain read-only.

## Scheduling reads

`list_calendar_events` requires `agenda:read`, not `sync:read` or `sync:write`.
Supply an inclusive `period: {start, end}` of at most 93 days and an IANA
`timezone`; follow `nextCursor` with the same range. Results include all-day and
linked events (the UI hides linked duplicates and hides all-day rows in Today).
Use linked events as context, not a second task commitment. This operation does
not assign times or edit provider events. Date-only provider
ends are exclusive. Timed events overlap the requested local range, including
cross-midnight events.

Inspect `status`, `lastSyncAt`, `windowStart` and `windowEnd` before scheduling.
`unavailable` is unknown, not an empty calendar. `stale` retains usable saved
context; do not claim it is the current provider state. Recurring instances are
expanded by Google only within the returned window. Missing instances outside
that window are not proof of free time. Full non-recurring imported records are
retained, including all-day context. Event descriptions, locations and times are
available in the cache; no OAuth tokens or provider sync tokens are exposed.


### Owner attendance

`selfResponseStatus` records the owner's RSVP: `accepted`, `declined`,
`tentative`, `needsAction`, or `unknown`. It is independent of `eventStatus`
(`confirmed`, `tentative`, `cancelled`, or `unknown`): an event can be confirmed
while its owner has declined. Declined invitations remain available as context
but must not reserve time, create scheduling conflicts, or trigger preparation
for attendance. The Today timeline omits them; Calendar labels them declined.

Missing or `unknown` RSVP is not acceptance. Do not promote tentative or
unanswered invitations to confirmed attendance. These optional fields allow
older cached records during rollout. The first poll of a snapshot without
attendance data performs a full provider refresh before committing its sync
token and attendance version; subsequent polls remain incremental. On the primary calendar, RSVP comes from the
self attendee. On the managed calendar, it comes from the configured owner's
email, not the managed calendar's own attendee. Other attendees are not exposed.

## Publication and recovery

`calendar_cache_publish` is a sync-only, bounded paged projection. Its durable
monotonic sequence fences older publications, generation identifies the
connection, and only the final complete page atomically replaces visible events
and metadata. Partial upload failures retain the prior visible cache. Exact page
retries are idempotent; a restarted worker backfills from durable snapshots and
starts a newer publication. Cancellation, full-resync removal and recurrence
expansion are inherited from the existing snapshot path. Resolved drafts and
planner conflicts travel with the snapshot.

Publication is bounded to 64 MiB staged JSON, 200,000 events, 1,000 drafts and
100,000 conflicts. Oversized or invalid input fails closed without replacing the
visible cache. Do not reset the private service's `mirror-sequence` independently
of the main database; restore them consistently or explicitly reconcile the
publication high-water mark. This PR does not alter backup/restore automation.

Deployment needs the additive Calendar-cache migration, new guest and updated
Calendar worker together. An older worker leaves the new cache explicitly
unavailable until backfill; it must not be represented as an empty day. No
production migration or deployment is performed by this change's qualification.
