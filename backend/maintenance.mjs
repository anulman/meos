// SPDX-License-Identifier: Apache-2.0
export const WEATHER_RETENTION_MS=24*60*60*1000
// Only the pinned host may supply this context; never expose a raw header trust boundary.
export function isWeatherMaintenance(context,{authority,method}) {
 return context?.kind==='Job'&&context.registered_path==='meos-weather-prune'&&context.user==null&&authority==='__job'&&method==='GET'
}
export function pruneWeather(storage,now=Date.now()) {return storage.maintenancePurge(now-WEATHER_RETENTION_MS,now)}
