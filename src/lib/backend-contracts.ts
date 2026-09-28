// SPDX-License-Identifier: Apache-2.0
import type { ID, Notes, Project, Routine, Settings, Task } from './contracts'

/** Both boundaries inclusive. A day has start=end; a week ends start+6 days. */
export interface DatePeriod { readonly start: string; readonly end: string }
/** Ownership is server-derived; never accepted in a writable domain DTO. */
export interface Stored<T> { value: T; revision: number; createdAt: string; updatedAt: string }
export interface Page<T> { items: Stored<T>[]; nextCursor?: string }
export interface ReadOptions { signal?: AbortSignal }
export interface ListOptions extends ReadOptions { cursor?: string; limit?: number }
export interface UpdateOptions extends ReadOptions { expectedRevision: number }
export interface WeeklyOutcome { id: ID; taskId: ID; period: DatePeriod; position: number }
export interface PeriodNote { id: ID; kind: 'day' | 'week'; period: DatePeriod; notes: Notes }
export interface OccurrenceCompletion { id: ID; routineId: ID; date: string; completed: boolean }
export interface CoarseLocation { latitude: number; longitude: number; label?: string }
export interface WeatherPreferences {
 enabled: boolean; source: 'latest' | 'manual'; units: 'celsius' | 'fahrenheit'; manual?: CoarseLocation
}
export interface Preferences extends Settings { weather: WeatherPreferences }
export interface LatestLocation extends CoarseLocation { observedAt: string; source: 'bridge' | 'manual' }
export interface WeatherReading { at: string; temperature: number; rainProbability: number; windSpeed: number }
export interface DailyWeather { date: string; minimum: number; maximum: number; rainProbability: number }
export interface WeatherSnapshot {
 status: 'fresh' | 'stale' | 'unavailable'; location?: LatestLocation; fetchedAt?: string; expiresAt?: string
 units: WeatherPreferences['units']; timezone: string; attribution: { label: string; url: string }
 current?: WeatherReading; hourly: WeatherReading[]; daily: DailyWeather[]
}
export interface SessionIdentity { id: ID; expiresAt: string }
export interface Resources {
 tasks: Task; projects: Project; routines: Routine; outcomes: WeeklyOutcome
 periodNotes: PeriodNote; occurrences: OccurrenceCompletion
}
export type ErrorCode = 'validation' | 'unauthenticated' | 'expired' | 'forbidden' | 'conflict' | 'not_found' | 'unavailable' | 'invalid_response' | 'aborted'
export interface ErrorDetails { fields?: Record<string, string>; expectedRevision?: number; currentRevision?: number }
export class RepositoryError extends Error {
 readonly code: ErrorCode
 readonly details?: ErrorDetails
 constructor(code: ErrorCode, message: string, details?: ErrorDetails) {
  super(message); this.name = 'RepositoryError'; this.code = code; this.details = details
 }
}
