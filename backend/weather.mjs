// SPDX-License-Identifier: Apache-2.0
import { DomainError, coarseLocation, date, timezone, validatePreferences } from './domain.mjs'
import { boundedText } from './body.mjs'

const PROVIDER='https://api.open-meteo.com/v1/forecast'
const attribution={label:'Weather data by Open-Meteo',url:'https://open-meteo.com/'}
const FORECAST_MS=30*60*1000, LOCATION_MS=2*60*60*1000, RETENTION_MS=24*60*60*1000
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max
const iso=value=>new Date(value).toISOString()
export function validateObservation(input,previous,now) {
 if(!input||typeof input!=='object'||Object.keys(input).some(key=>!['latitude','longitude','label','observedAt','source'].includes(key)))throw new DomainError('validation','Invalid location observation')
 const {observedAt,source,...coordinates}=input
 const observed=Date.parse(observedAt)
 if(typeof observedAt!=='string'||!Number.isFinite(observed)||observed>now||now-observed>RETENTION_MS||!['bridge','manual'].includes(source))throw new DomainError('validation','Invalid location observation')
 if(previous&&observed<=Date.parse(previous.observedAt))throw new DomainError('conflict','Location observation is not newer')
 return {...coarseLocation(coordinates),observedAt:iso(observed),source}
}
export function providerUrl(location,preferences) {
 const point=coarseLocation({latitude:location.latitude,longitude:location.longitude});timezone(preferences.timezone)
 const url=new URL(PROVIDER)
 url.search=new URLSearchParams({latitude:String(point.latitude),longitude:String(point.longitude),timezone:preferences.timezone,
  temperature_unit:preferences.weather.units,wind_speed_unit:'kmh',forecast_days:'7',
  current:'temperature_2m,wind_speed_10m',hourly:'temperature_2m,precipitation_probability,wind_speed_10m',daily:'temperature_2m_min,temperature_2m_max,precipitation_probability_max'}).toString()
 return url
}
function decodeForecast(data) {
 const invalid=()=>{throw new DomainError('invalid_response','Invalid weather provider response')}
 if(!data||typeof data!=='object'||!data.current||!data.hourly||!data.daily)invalid()
 const {current,hourly,daily}=data
 const localTime=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value))return false;try{date(value.slice(0,10));return true}catch{return false}}
 if(!localTime(current.time)||!finite(current.temperature_2m,-150,200)||!finite(current.wind_speed_10m,0,1000))invalid()
 if(!Array.isArray(hourly.time)||hourly.time.length<1||hourly.time.length>200||!Array.isArray(daily.time)||daily.time.length<1||daily.time.length>7)invalid()
 for(const key of ['temperature_2m','precipitation_probability','wind_speed_10m'])if(!Array.isArray(hourly[key])||hourly[key].length!==hourly.time.length)invalid()
 for(const key of ['temperature_2m_min','temperature_2m_max','precipitation_probability_max'])if(!Array.isArray(daily[key])||daily[key].length!==daily.time.length)invalid()
 const hours=hourly.time.map((at,i)=>{
  const temperature=hourly.temperature_2m[i],rainProbability=hourly.precipitation_probability[i],windSpeed=hourly.wind_speed_10m[i]
  if(!localTime(at)||!finite(temperature,-150,200)||!finite(rainProbability,0,100)||!finite(windSpeed,0,1000))invalid()
  return {at,temperature,rainProbability,windSpeed}
 })
 const days=daily.time.map((date,i)=>{
  const minimum=daily.temperature_2m_min[i],maximum=daily.temperature_2m_max[i],rainProbability=daily.precipitation_probability_max[i]
  if(typeof date!=='string'||!localTime(date+'T00:00')||!finite(minimum,-150,200)||!finite(maximum,minimum,200)||!finite(rainProbability,0,100))invalid()
  return {date,minimum,maximum,rainProbability}
 })
 const matchingHour=hours.find(row=>row.at.slice(0,13)===current.time.slice(0,13))
 if(!matchingHour)invalid()
 return {current:{at:current.time,temperature:current.temperature_2m,windSpeed:current.wind_speed_10m,rainProbability:matchingHour.rainProbability},hourly:hours,daily:days}
}

/** Storage is owner-scoped by the production adapter. No planner command depends on this module. */
function weatherFlows({now=()=>Date.now(),timeoutMs=5000}) {
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new DomainError('validation','Invalid provider timeout')
 return {
  *ingest(owner,observation) {
   // Storage performs its own timestamp CAS to protect concurrent bridge observations.
   const previous=yield {kind:'storage',method:'latest',args:[owner]}
   const value=validateObservation(observation,previous,now())
   yield {kind:'storage',method:'replaceLatest',args:[owner,value,previous?.observedAt]}
   return value
  },
  *read(owner,rawPreferences) {
   const preferences=validatePreferences(rawPreferences),timestamp=now()
   const empty={status:'unavailable',units:preferences.weather.units,timezone:preferences.timezone,attribution,hourly:[],daily:[]}
   yield {kind:'storage',method:'purgeBefore',args:[timestamp-RETENTION_MS]}
   if(!preferences.weather.enabled)return empty
   const latest=preferences.weather.source==='latest'?(yield {kind:'storage',method:'latest',args:[owner]}):undefined
   const staleLocation=latest&&timestamp-Date.parse(latest.observedAt)>LOCATION_MS
   const manual=preferences.weather.manual
   const location=preferences.weather.source==='manual'||(!latest||staleLocation)&&manual
    ? manual&&{...manual,source:'manual',observedAt:iso(timestamp)} : latest
   if(!location)return empty
   const key=[location.latitude,location.longitude,preferences.weather.units,preferences.timezone].join('|')
   const cached=yield {kind:'storage',method:'cached',args:[owner,key]}
   const retained=cached&&timestamp-Date.parse(cached.fetchedAt)<RETENTION_MS?cached:undefined
   if(retained&&Date.parse(retained.expiresAt)>timestamp)return {...retained,location,status:staleLocation&&location.source==='bridge'?'stale':'fresh'}
   try {
    const response=yield {kind:'fetch',url:providerUrl(location,preferences),timeoutMs}
    if(!response.ok)throw new DomainError('unavailable','Weather provider unavailable')
    const body=yield {kind:'body',response,maxBytes:500000}
    const forecast=decodeForecast(JSON.parse(body))
    const result={...empty,...forecast,location,fetchedAt:iso(timestamp),expiresAt:iso(timestamp+FORECAST_MS),status:staleLocation&&location.source==='bridge'?'stale':'fresh'}
    yield {kind:'storage',method:'save',args:[owner,key,result]}
    return result
   }catch{
    // Do not include request URLs, coordinates or provider error details in logs/errors.
    return retained?{...retained,location,status:'stale'}:{...empty,location}
   }
  }
 }
}


function effectValue(effect,{storage,fetcher,readText},synchronous) {
 if(effect.kind==='storage')return storage[effect.method](...effect.args)
 if(effect.kind==='body')return readText(effect.response,effect.maxBytes)
 const options={method:'GET',redirect:'error',headers:{Accept:'application/json'}}
 if(synchronous)options.timeoutMs=effect.timeoutMs
 else options.signal=AbortSignal.timeout(effect.timeoutMs)
 return fetcher(effect.url,options)
}
export function createWeather({storage,fetcher=fetch,...options}) {
 const flows=weatherFlows(options),effects={storage,fetcher,readText:boundedText}
 return Object.fromEntries(Object.entries(flows).map(([name,flow])=>[name,async(...args)=>{
  const iterator=flow(...args);let step=iterator.next()
  while(!step.done){try{step=iterator.next(await effectValue(step.value,effects,false))}catch(error){step=iterator.throw(error)}}
  return step.value
 }]))
}
export function createSynchronousWeather({storage,fetcher,readText,...options}) {
 const flows=weatherFlows(options),effects={storage,fetcher,readText}
 return Object.fromEntries(Object.entries(flows).map(([name,flow])=>[name,(...args)=>{
  const iterator=flow(...args);let step=iterator.next()
  while(!step.done){try{
   const value=effectValue(step.value,effects,true)
   if(value&&typeof value.then==='function')throw new Error('Async effect in synchronous guest')
   step=iterator.next(value)
  }catch(error){step=iterator.throw(error)}}
  return step.value
 }]))
}
