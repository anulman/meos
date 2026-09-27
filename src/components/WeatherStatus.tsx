// SPDX-License-Identifier: Apache-2.0
import {useEffect,useState} from 'react'
import {getConfig} from '../lib/config'
import {getPreferences} from '../lib/backend/ui-repository'
import {transport} from '../lib/backend/session'
export function WeatherStatus(){
 const [text,setText]=useState('Weather unavailable')
 useEffect(()=>{if(getConfig().demo)return;let active=true;void(async()=>{try{const prefs=await getPreferences();if(!prefs.weather.enabled){if(active)setText('Weather is disabled');return}const weather:any=await transport.request('/weather',x=>x);if(active)setText(weather.status==='unavailable'?'Weather unavailable — your planning still works':weather.current?`${weather.current.temperature}° — ${weather.status==='stale'?'last available weather':'current weather'}`:'Weather unavailable')}catch{if(active)setText('Weather unavailable — your planning still works')}})();return()=>{active=false}},[])
 if(getConfig().demo)return null
 return <p className="muted" role="status">{text}</p>
}
