// SPDX-License-Identifier: Apache-2.0
import { RepositoryError } from '../backend-contracts'
import type { DatePeriod, Page, Stored } from '../backend-contracts'

export function uuidToBase64(id: string): string {
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new RepositoryError('validation', 'Expected UUIDv4 or UUIDv7')
 const bytes = id.replaceAll('-', '').match(/../g)!.map(hex => String.fromCharCode(parseInt(hex, 16))).join('')
 return btoa(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
export function base64ToUuid(value: unknown): string {
 if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(value)) throw new RepositoryError('invalid_response', 'Invalid UUID encoding')
 const bytes = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '==')
 const hex = [...bytes].map(char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
 const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
 try { if (uuidToBase64(id) !== value) throw Error() } catch { throw new RepositoryError('invalid_response', 'Invalid UUID encoding') }
 return id
}
export function isRealDate(value: unknown): value is string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
 const date = new Date(`${value}T00:00:00Z`)
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value
}
export function assertPeriod(period: DatePeriod, kind: 'day' | 'week'): void {
 if (!isRealDate(period.start) || !isRealDate(period.end)) throw new RepositoryError('validation', 'Invalid period date')
 const days = (Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86400000
 if (days !== (kind === 'day' ? 0 : 6)) throw new RepositoryError('validation', 'Period boundaries must be inclusive')
}
export function decodeBoolean(value: unknown): boolean {
 if (value !== 0 && value !== 1) throw new RepositoryError('invalid_response', 'Invalid database boolean')
 return value === 1
}
export function nullable<T>(value: T | null): T | undefined { return value === null ? undefined : value }
/** Complete PUT codec: cleared optional properties must reach SQL as null. */
export function encodeOptional<T>(value: T | undefined): T | null { return value === undefined ? null : value }
export function assertRevision(value: number, allowCreate = false): void {
 if (!Number.isSafeInteger(value) || value < (allowCreate ? 0 : 1)) throw new RepositoryError('validation', 'An expected revision is required')
}
export function decodeStored<T>(input: unknown, decode: (value: unknown) => T): Stored<T> {
 if (!input || typeof input !== 'object') throw new RepositoryError('invalid_response', 'Invalid record')
 const row = input as Record<string, unknown>
 if (!Number.isSafeInteger(row.revision) || (row.revision as number) < 1 ||
  typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)) ||
  typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new RepositoryError('invalid_response', 'Invalid record metadata')
 return {value: decode(row.value), revision: row.revision as number, createdAt: row.createdAt, updatedAt: row.updatedAt}
}
/** Fails visibly on repeated cursors or an unreasonable bound, never returns partial success. */
export async function collectPages<T>(read: (cursor?: string) => Promise<Page<T>>, maxPages = 1000): Promise<Stored<T>[]> {
 if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new RepositoryError('validation', 'Invalid page bound')
 const result: Stored<T>[] = []; const seen = new Set<string>(); let cursor: string | undefined
 for (let page = 0; page < maxPages; page++) {
  const response = await read(cursor)
  if (!Array.isArray(response.items)) throw new RepositoryError('invalid_response', 'Invalid page')
  result.push(...response.items)
  if (response.nextCursor === undefined) return result
  if (typeof response.nextCursor !== 'string' || !response.nextCursor || seen.has(response.nextCursor)) throw new RepositoryError('invalid_response', 'Invalid pagination cursor')
  seen.add(response.nextCursor); cursor = response.nextCursor
 }
 throw new RepositoryError('invalid_response', 'Pagination bound exceeded')
}
