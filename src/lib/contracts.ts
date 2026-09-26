import type {PreferredTime,RecurrenceIntent,Occurrence as BackendOccurrence} from "./backend/generated"
/** UUID identifiers are stable for the lifetime of an entity. Dates are ISO date-only. */
export type ID = string
export type Priority = 'none' | 'low' | 'medium' | 'high'
export interface Notes { [key:string]:unknown; type: 'doc'; content?: Array<Record<string, unknown>> }
export interface Schedule { offsetMinutes?:number; date: string; time: string; timezone: string }
export interface LinkedReference { id: ID; label: string; url: string }
export interface Task { _revision?:number; preferredTime?:PreferredTime; id: ID; title: string; completed: boolean; priority: Priority; projectId?: ID; schedule?: Schedule; durationMinutes?: number; archived?: boolean; references?: LinkedReference[]; notes: Notes }
export interface Project { _revision?:number; id: ID; title: string; completed?: boolean; archived?: boolean; targetDate?: string; references?: LinkedReference[]; notes: Notes }
export interface Routine { _revision?:number; preferredTime?:PreferredTime; recurrenceIntent?:RecurrenceIntent; id: ID; title: string; weekdays: number[]; time?: string; timezone: string; durationMinutes?: number; archived?: boolean; notes: Notes }
export interface Occurrence extends BackendOccurrence { _revision?:number }
export interface Reference { id: ID; kind: 'task' | 'project' | 'routine'; entityId: ID }
export interface Settings { timezone: string; weekStartsOn: 0 | 1 }
export interface PublicConfig {
  accessGated?: boolean; timezone: string; apiBase: string; demo: boolean }
