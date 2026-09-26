// SPDX-License-Identifier: Apache-2.0
import { date, timezone } from '../../../backend/domain.mjs'
import { RepositoryError } from '../backend-contracts'
import type { WeatherSnapshot } from '../backend-contracts'

const invalid=():never=>{throw new RepositoryError('invalid_response','Invalid weather snapshot')}
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>}
const number=(value:unknown,min:number,max:number):number=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)return invalid();return value}
const instant=(value:unknown):string=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value)))return invalid();return value}
const local=(value:unknown):string=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d$/.test(value))return invalid();date(value.slice(0,10));return value}
const reading=(raw:unknown)=>{const value=record(raw);return {at:local(value.at),temperature:number(value.temperature,-150,200),rainProbability:number(value.rainProbability,0,100),windSpeed:number(value.windSpeed,0,1000)}}
export function decodeWeather(raw:unknown):WeatherSnapshot {
 try {
  const value=record(raw)
  if(!['fresh','stale','unavailable'].includes(String(value.status))||!['celsius','fahrenheit'].includes(String(value.units)))return invalid()
  const zone=timezone(value.timezone)
  const attribution=record(value.attribution)
  if(attribution.url!=='https://open-meteo.com/'||typeof attribution.label!=='string'||attribution.label.length>200)return invalid()
  if(!Array.isArray(value.hourly)||value.hourly.length>200||!Array.isArray(value.daily)||value.daily.length>7)return invalid()
  const result:WeatherSnapshot={status:value.status as WeatherSnapshot['status'],units:value.units as WeatherSnapshot['units'],timezone:zone,attribution:{url:attribution.url,label:attribution.label},hourly:value.hourly.map(reading),daily:value.daily.map(raw=>{
   const row=record(raw);const minimum=number(row.minimum,-150,200)
   return {date:date(row.date),minimum,maximum:number(row.maximum,minimum,200),rainProbability:number(row.rainProbability,0,100)}
  })}
  if(value.location!==undefined){
   const location=record(value.location)
   if(!['bridge','manual'].includes(String(location.source)))return invalid()
   const latitude=number(location.latitude,-90,90),longitude=number(location.longitude,-180,180)
   if(Math.round(latitude*100)/100!==latitude||Math.round(longitude*100)/100!==longitude)return invalid()
   if(location.label!==undefined&&(typeof location.label!=='string'||location.label.length>200))return invalid()
   result.location={latitude,longitude,source:location.source as 'bridge'|'manual',observedAt:instant(location.observedAt),...(location.label===undefined?{}:{label:location.label as string})}
  }
  if(value.current!==undefined)result.current=reading(value.current)
  if(value.fetchedAt!==undefined)result.fetchedAt=instant(value.fetchedAt)
  if(value.expiresAt!==undefined)result.expiresAt=instant(value.expiresAt)
  if(result.status!=='unavailable'&&(!result.location||!result.current||!result.fetchedAt||!result.expiresAt||!result.hourly.length||!result.daily.length))return invalid()
  if(result.fetchedAt&&result.expiresAt&&Date.parse(result.expiresAt)<=Date.parse(result.fetchedAt))return invalid()
  return result
 }catch{return invalid()}
}
