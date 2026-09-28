import {getConfig} from './config'
import {scheduledInstant} from '../../backend/scheduling.mjs'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addDays, dateInZone, dayPeriod, millisecondsUntilNextDay, periodContains,
  weekPeriod, zonedInstant,
  type DatePeriod, type ZonedSchedule } from './dates';
import type { PlannerPreferences } from './planner-contracts';

export interface PlannerClock {
  preferences: PlannerPreferences;
  now: number;
  today: string;
  todayPeriod: DatePeriod;
  thisWeek: DatePeriod;
  nextWeek: DatePeriod;
  setPreferences: (update: Partial<PlannerPreferences>) => void;
  refresh: () => void;
  /** Capture this value once when opening an editor; do not re-key on clock changes. */
  capturePeriod: (kind: 'day' | 'week', date?: string) => DatePeriod;
}
const ClockContext = createContext<PlannerClock | null>(null);

export function selectedWeekPeriod(today: string, weekStartsOn: 0 | 1, selection: 'this' | 'next'): DatePeriod {
  return weekPeriod(selection === 'next' ? addDays(today, 7) : today, weekStartsOn);
}
function validatePreferences(preferences: PlannerPreferences): void {
  dateInZone(0, preferences.timezone);
  if (preferences.timeFormat !== undefined && !['12-hour', '24-hour'].includes(preferences.timeFormat)) throw new RangeError('Invalid time format');
  if (preferences.weekStartsOn !== 0 && preferences.weekStartsOn !== 1) throw new RangeError('Invalid week start');
}

/**
 * Page-memory state only. Updating display preferences never rewrites schedules
 * or remounts children. Check at least hourly for system-clock/zone-rule changes;
 * focus/visibility refresh immediately after a suspended tab resumes.
 */
export function PlannerClockProvider({ initialPreferences, children }: {
  initialPreferences: PlannerPreferences;
  children: ReactNode;
}) {
  const [preferences, updatePreferences] = useState<PlannerPreferences>(() => {
    validatePreferences(initialPreferences);
    return { ...initialPreferences };
  });
  useEffect(()=>{validatePreferences(initialPreferences);updatePreferences(previous=>({...previous,...initialPreferences}))},[initialPreferences.timezone,initialPreferences.weekStartsOn]);
  const [now, setNow] = useState(() => Date.now());
  const refresh = useCallback(() => setNow(Date.now()), []);
  const setPreferences = useCallback((update: Partial<PlannerPreferences>) => {
    updatePreferences(previous => {
      const next = { ...previous, ...update };
      validatePreferences(next);
      return next;
    });
    setNow(Date.now());
  }, []);
  useEffect(() => {
    const delay = Math.max(50, Math.min(3_600_000, millisecondsUntilNextDay(Date.now(), preferences.timezone) + 25));
    const timer = window.setTimeout(refresh, delay);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [now, preferences.timezone, refresh]);
  const value = useMemo<PlannerClock>(() => {
    const today = dateInZone(now, preferences.timezone);
    return {
      preferences, now, today, todayPeriod: dayPeriod(today),
      thisWeek: selectedWeekPeriod(today, preferences.weekStartsOn, 'this'),
      nextWeek: selectedWeekPeriod(today, preferences.weekStartsOn, 'next'),
      setPreferences, refresh,
      capturePeriod: (kind, date = today) => kind === 'day' ? dayPeriod(date) : weekPeriod(date, preferences.weekStartsOn),
    };
  }, [now, preferences, refresh, setPreferences]);
  return <ClockContext.Provider value={value}>{children}</ClockContext.Provider>;
}
export function usePlannerClock(): PlannerClock {
  const value = useContext(ClockContext);
  if (!value) throw new Error('usePlannerClock requires PlannerClockProvider');
  return value;
}

export interface ScheduledTaskLike { id: string; archived?: boolean; schedule?: ZonedSchedule }
export interface ProjectedTask<T> { task: T; displayDate: string; instant: number }
/** Only tasks with a valid datetime appear in calendar periods; legacy drafts stay in resource lists. */
export function projectScheduledTasks<T extends ScheduledTaskLike>(tasks: readonly T[], period: DatePeriod,
  displayTimezone: string): ProjectedTask<T>[] {
  return tasks.flatMap(task => {
    if (task.archived || !task.schedule || !task.schedule.time) return [];
    // Malformed imported/legacy schedules must neither crash nor leak into daily views.
    let instant: number;
    try {
      if (typeof task.schedule.timezone !== 'string' || !task.schedule.timezone) return [];
      instant = getConfig().demo?zonedInstant(task.schedule.date, task.schedule.time, task.schedule.timezone):scheduledInstant({...task.schedule,time:task.schedule.time});
    } catch { return []; }
    const displayDate = dateInZone(instant, displayTimezone);
    if (!periodContains(period, displayDate)) return [];
    return [{ task, displayDate, instant }];
  });
}
