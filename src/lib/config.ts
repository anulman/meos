import type { PublicConfig } from './contracts'
declare global { interface Window { MEOS_CONFIG?: Partial<PublicConfig> } }
export function getConfig(): PublicConfig {
 const value = typeof window === 'undefined' ? {} : window.MEOS_CONFIG ?? {}
 const timezone = value.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
 new Intl.DateTimeFormat('en',{timeZone:timezone})
 const apiBase = value.apiBase || '/api'
 if (!apiBase.startsWith('/') || apiBase.startsWith('//')) throw new Error('API base must be a same-origin absolute path')
 if(value.demo === false) throw new Error('This client-only preview requires demo mode')
 return { timezone, apiBase:apiBase.replace(/\/$/,''), demo:true }
}
