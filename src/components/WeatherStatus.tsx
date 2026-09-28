// SPDX-License-Identifier: Apache-2.0
import {useQuery} from '@tanstack/react-query'
import {getConfig} from '../lib/config'
import {preferencesOptions} from '../lib/backend/ui-repository'
import {transport} from '../lib/backend/session'
export function WeatherStatus(){
 const {data:prefs}=useQuery({...preferencesOptions,enabled:false})
 const {data,isError}=useQuery({queryKey:['weather',prefs?._revision],enabled:!getConfig().demo&&!!prefs?.weather.enabled,staleTime:300_000,queryFn:({signal})=>transport.request<any>('/weather',x=>x,{signal})})
 if(getConfig().demo)return null
 const text=!prefs?.weather.enabled?'Weather is disabled':isError||data?.status==='unavailable'?'Weather unavailable — your planning still works':data?.current?`${data.current.temperature}° — ${data.status==='stale'?'last available weather':'current weather'}`:'Loading weather…'
 return <p className="muted" role="status">{text}</p>
}
