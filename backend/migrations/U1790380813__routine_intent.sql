-- SPDX-License-Identifier: Apache-2.0
-- Templates retain intent only. Existing occurrences are historical snapshots:
-- do not rewrite their schedules, durations, notes, or template revisions.
-- json_insert preserves newer user-authored intent in mixed-version records.
WITH legacy AS (
 SELECT id, doc,
  'every ' || (SELECT group_concat(name, ', ') FROM (
   SELECT CASE value WHEN 0 THEN 'sunday' WHEN 1 THEN 'monday'
    WHEN 2 THEN 'tuesday' WHEN 3 THEN 'wednesday' WHEN 4 THEN 'thursday'
    WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday' END AS name
   FROM json_each(routines.doc, '$.weekdays') ORDER BY value
  )) AS recurrence_text,
  CASE WHEN json_type(doc, '$.time')='text' THEN
   'Legacy hard time constraint: exactly ' || json_extract(doc, '$.time') ||
   ' (' || json_extract(doc, '$.timezone') || '). This is a constraint, not a soft preference.'
   ELSE '' END ||
  CASE WHEN json_type(doc, '$.durationMinutes')='integer'
    AND json_type(doc, '$.durationIntent')='text' THEN
   CASE WHEN json_type(doc, '$.time')='text' THEN ' ' ELSE '' END ||
   'Legacy planned duration: ' || json_extract(doc, '$.durationMinutes') ||
   ' minutes; existing duration intent retained.' ELSE '' END ||
  CASE WHEN json_type(doc, '$.actualDurationMinutes')='integer' THEN
   CASE WHEN json_type(doc, '$.time')='text' OR
    (json_type(doc, '$.durationMinutes')='integer' AND json_type(doc, '$.durationIntent')='text')
    THEN ' ' ELSE '' END ||
   'Legacy actual duration recorded on template: ' || json_extract(doc, '$.actualDurationMinutes') ||
   ' minutes; not assigned to any occurrence.' ELSE '' END AS preserved_constraints
 FROM routines
 WHERE json_type(doc, '$.weekdays') IS NOT NULL
    OR json_type(doc, '$.time') IS NOT NULL
    OR json_type(doc, '$.durationMinutes') IS NOT NULL
    OR json_type(doc, '$.actualDurationMinutes') IS NOT NULL
), recurrence AS (
 SELECT id, preserved_constraints,
  CASE WHEN recurrence_text IS NOT NULL THEN json_insert(doc, '$.recurrenceIntent',
   json_object('text', recurrence_text, 'status', 'validated', 'kind', 'fixed',
    'weekdays', json((SELECT json_group_array(value) FROM (
     SELECT value FROM json_each(legacy.doc, '$.weekdays') ORDER BY value
    ))), 'intervalWeeks', 1, 'anchorDate', '2020-01-01')) ELSE doc END AS doc
 FROM legacy
), duration AS (
 SELECT id, preserved_constraints,
  CASE WHEN json_type(doc, '$.durationMinutes')='integer' THEN
   json_insert(doc, '$.durationIntent', json_extract(doc, '$.durationMinutes') || ' minutes')
   ELSE doc END AS doc
 FROM recurrence
), preserved AS (
 SELECT id, CASE WHEN preserved_constraints!='' THEN
  json_insert(json_insert(doc, '$.notes.content', json('[]')), '$.notes.content[#]',
   json_object('type', 'paragraph', 'content', json_array(
    json_object('type', 'text', 'text', preserved_constraints)))) ELSE doc END AS doc
 FROM duration
)
UPDATE routines SET
 doc=json_remove((SELECT doc FROM preserved WHERE preserved.id=routines.id),
  '$.weekdays', '$.time', '$.durationMinutes', '$.actualDurationMinutes'),
 revision=revision+1, updated_at=MAX(updated_at, unixepoch()*1000)
WHERE id IN (SELECT id FROM preserved);
