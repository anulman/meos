import type { DatePeriod } from './dates';

// Frontend semantic additions only; transport/revision ownership stays in the API.
export interface PlannerNotes { [key:string]:unknown; type: 'doc'; content?: Array<Record<string, unknown>> }
export interface WeeklyOutcome { id: string; taskId: string; period: DatePeriod; position: number }
export interface PeriodNote { id: string; kind: 'day' | 'week'; period: DatePeriod; notes: PlannerNotes }
export interface RoutineMetadata { durationMinutes?: number; archived?: boolean }
export interface WeatherPreferences {
  enabled: boolean;
  source: 'latest' | 'manual';
  manual?: { latitude: number; longitude: number; name?: string };
  units: 'celsius' | 'fahrenheit';
}
export interface PlannerPreferences { timezone: string; weekStartsOn: 0 | 1; timeFormat?: '12-hour' | '24-hour' }
