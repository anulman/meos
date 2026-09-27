import type { ErrorCode, Preferences, Resources, CoarseLocation } from '../src/lib/backend-contracts'
export class DomainError extends Error { code: ErrorCode; details?: unknown; constructor(code:ErrorCode,message:string,details?:unknown) }
export function validateResource<K extends keyof Resources>(kind:K,input:unknown):Resources[K]
export function validatePreferences(input:unknown):Preferences
export function uuid(value:unknown,field?:string):string
export function date(value:unknown,field?:string):string
export function timezone(value:unknown,field?:string):string
export function notes(value:unknown):unknown
export function period(value:unknown,kind:'day'|'week'):void
export function safeUrl(value:unknown,field?:string):string
export function coarseLocation(value:unknown):CoarseLocation
export function canonical(value:unknown):string
