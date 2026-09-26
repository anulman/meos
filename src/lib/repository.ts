// SPDX-License-Identifier: Apache-2.0
import type { ID } from './contracts'
import type { ListOptions, Page, PeriodNote, Preferences, ReadOptions, Resources, SessionIdentity, Stored, UpdateOptions, WeatherSnapshot } from './backend-contracts'

/** Domain seam; the demo and production adapters implement this same interface. */
export interface MeosRepository {
 list<K extends keyof Resources>(resource: K, options?: ListOptions): Promise<Page<Resources[K]>>
 get<K extends keyof Resources>(resource: K, id: ID, options?: ReadOptions): Promise<Stored<Resources[K]>>
 create<K extends keyof Resources>(resource: K, value: Resources[K], options?: ReadOptions): Promise<Stored<Resources[K]>>
 update<K extends keyof Resources>(resource: K, value: Resources[K], options: UpdateOptions): Promise<Stored<Resources[K]>>
 /** Server transaction: archives project and unassigns tasks, incrementing every affected revision. */
 archiveProject(id: ID, options: UpdateOptions): Promise<{ project: Stored<Resources['projects']>; affectedTaskIds: ID[] }>
 /** Natural key owner/routine/date: one occurrence only, no recurrence mutation. */
 setOccurrenceCompletion(value: Resources['occurrences'], options: UpdateOptions): Promise<Stored<Resources['occurrences']>>
 /** expectedRevision=0 means create-if-absent for natural-key singleton commands. */
 savePeriodNote(value: PeriodNote, options: UpdateOptions): Promise<Stored<PeriodNote>>
 removeOutcome(id: ID, options: UpdateOptions): Promise<void>
 getPreferences(options?: ReadOptions): Promise<Stored<Preferences>>
 savePreferences(value: Preferences, options: UpdateOptions): Promise<Stored<Preferences>>
 getWeather(options?: ReadOptions): Promise<WeatherSnapshot>
}
export interface MeosSession {
 current(options?: ReadOptions): Promise<SessionIdentity | null>
 login(email: string, password: string, options?: ReadOptions): Promise<SessionIdentity>
 refresh(options?: ReadOptions): Promise<SessionIdentity>
 logout(options?: ReadOptions): Promise<void>
 /** Called after requests abort and all old user data is cleared. */
 onIdentityChange(listener: (identity: SessionIdentity | null) => void): () => void
}
