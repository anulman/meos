// SPDX-License-Identifier: Apache-2.0
import { RepositoryError } from '../backend-contracts'
import type { ErrorCode } from '../backend-contracts'

/** HTTP foundation only: pinned TrailBase routes/codecs and CSRF negotiation remain to qualify. */
export class JsonTransport {
 private controller = new AbortController()
 private generation = 0
 private readonly basePath: string
 private readonly csrfToken: () => string | undefined
 private readonly fetcher: typeof fetch
 constructor(basePath: string, csrfToken: () => string | undefined, fetcher: typeof fetch = fetch) {
  if (!/^\/[A-Za-z0-9/_-]*$/.test(basePath) || basePath.startsWith('//') || basePath.endsWith('/')) throw new RepositoryError('validation', 'Use a same-origin API path without trailing slash')
  this.basePath = basePath; this.csrfToken = csrfToken; this.fetcher = fetcher
 }
 /** Invoke before clearing collections on logout/identity transition. Rejects even late successful responses. */
 invalidateSession(): void { this.generation++; this.controller.abort(); this.controller = new AbortController() }
 async request<T>(path: string, decode: (value: unknown) => T, options: { method?: 'GET'|'POST'|'PUT'|'DELETE'; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (!/^\/[A-Za-z0-9/_?=&%-]*$/.test(path) || path.startsWith('//') || /%2e|%2f|%5c/i.test(path)) throw new RepositoryError('validation', 'Invalid API route')
  const generation = this.generation
  const signal = options.signal ? AbortSignal.any([options.signal, this.controller.signal]) : this.controller.signal
  const method = options.method ?? 'GET'; const headers: Record<string,string> = {Accept: 'application/json'}
  if (method !== 'GET') {
   const token = this.csrfToken()
   if (!token) throw new RepositoryError('unauthenticated', 'CSRF session has not been established')
   headers['X-CSRF-Token'] = token; headers['Content-Type'] = 'application/json'
  }
  try {
   const response = await this.fetcher(this.basePath + path, {method, headers, credentials:'same-origin', cache:'no-store', redirect:'error', signal, body:options.body === undefined ? undefined : JSON.stringify(options.body)})
   if (signal.aborted || generation !== this.generation) throw new RepositoryError('aborted', 'Session changed')
   if (!response.ok) {
    const codes: Record<number,ErrorCode> = {400:'validation',401:'unauthenticated',403:'forbidden',404:'not_found',409:'conflict',412:'conflict',422:'validation'}
    throw new RepositoryError(codes[response.status] ?? 'unavailable', `Request failed (${response.status})`)
   }
   const value: unknown = response.status === 204 ? null : await response.json()
   if (signal.aborted || generation !== this.generation) throw new RepositoryError('aborted', 'Session changed')
   try { return decode(value) } catch (error) { if (error instanceof RepositoryError) throw error; throw new RepositoryError('invalid_response', 'Unexpected server response') }
  } catch (error) {
   if (signal.aborted || generation !== this.generation) throw new RepositoryError('aborted', 'Request cancelled')
   if (error instanceof RepositoryError) throw error
   if (error instanceof SyntaxError) throw new RepositoryError('invalid_response', 'Expected a JSON response')
   throw new RepositoryError('unavailable', 'Service could not be reached')
  }
 }
}
