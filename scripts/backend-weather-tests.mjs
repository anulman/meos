// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import { createWeather, providerUrl, validateObservation } from '../backend/weather.mjs'
import { DomainError, validatePreferences } from '../backend/domain.mjs'
const prefs={timezone:'UTC',weekStartsOn:1,weather:{enabled:true,source:'latest',units:'celsius',manual:{latitude:0,longitude:0,label:'Synthetic fallback'}}}
const instant=Date.parse('2026-09-26T12:00:00Z')
const forecast={current:{time:'2026-09-26T12:00',temperature_2m:20,wind_speed_10m:10},hourly:{time:['2026-09-26T12:00'],temperature_2m:[20],wind_speed_10m:[10],precipitation_probability:[5]},daily:{time:['2026-09-26'],temperature_2m_min:[12],temperature_2m_max:[22],precipitation_probability_max:[10]}}
function memory(){const locations=new Map(),cache=new Map();return {
 latest:owner=>locations.get(owner),
 replaceLatest(owner,value,expected){if(locations.get(owner)?.observedAt!==expected)throw new DomainError('conflict','Concurrent location');locations.set(owner,value)},
 cached:(owner,key)=>cache.get(owner+'|'+key),save:(owner,key,value)=>cache.set(owner+'|'+key,value),
 purgeBefore(timestamp){for(const[key,value]of cache)if(Date.parse(value.fetchedAt)<timestamp)cache.delete(key)},size:()=>cache.size
}}
test('location ingestion retains only coarse latest and rejects future, stale and concurrent observations',async()=>{
 const storage=memory();const weather=createWeather({storage,now:()=>instant})
 const observation={latitude:0.123456,longitude:0.987654,source:'bridge',observedAt:'2026-09-26T11:59:00Z'}
 const saved=await weather.ingest('synthetic-a',observation)
 assert.equal(saved.latitude,0.12);assert.equal(saved.longitude,0.99)
 await assert.rejects(weather.ingest('synthetic-a',observation),{code:'conflict'})
 assert.equal(await storage.latest('synthetic-b'),undefined)
 assert.throws(()=>validateObservation({...observation,observedAt:'2026-09-26T12:00:01Z'},undefined,instant),{code:'validation'})
 assert.throws(()=>validateObservation({...observation,observedAt:'2026-09-24T12:00:00Z'},undefined,instant),{code:'validation'})
 assert.throws(()=>storage.replaceLatest('synthetic-a',saved,undefined),{code:'conflict'})
})
test('provider URL is fixed, rounds location, honors units and manual preferences also remain coarse',()=>{
 const p=validatePreferences({...prefs,weather:{...prefs.weather,units:'fahrenheit',manual:{latitude:0.123456,longitude:0.987654}}})
 assert.equal(p.weather.manual.latitude,0.12)
 const url=providerUrl({latitude:0.123456,longitude:0.987654},p)
 assert.equal(url.origin,'https://api.open-meteo.com');assert.equal(url.searchParams.get('latitude'),'0.12')
 assert.equal(url.searchParams.get('temperature_unit'),'fahrenheit')
})
test('forecast freshness, failure fallback and retention remain owner-scoped',async()=>{
 let now=instant,fail=false,calls=0
 const storage=memory(),weather=createWeather({storage,now:()=>now,fetcher:async(url,options)=>{
  calls++;assert.equal(options.redirect,'error');if(fail)throw Error('synthetic outage');return Response.json(forecast)
 }})
 let result=await weather.read('synthetic-a',prefs)
 assert.equal(result.status,'fresh');assert.equal(result.location.source,'manual');assert.equal(calls,1)
 assert.equal(result.attribution.url,'https://open-meteo.com/')
 now+=1000;result=await weather.read('synthetic-a',prefs);assert.equal(calls,1)
 now+=31*60*1000;fail=true;result=await weather.read('synthetic-a',prefs);assert.equal(result.status,'stale');assert.equal(result.current.temperature,20)
 assert.equal((await weather.read('synthetic-b',prefs)).status,'unavailable')
 now+=24*60*60*1000;result=await weather.read('synthetic-a',prefs);assert.equal(result.status,'unavailable');assert.equal(storage.size(),0)
})
test('stale bridge falls back manually; disabled weather makes no provider call',async()=>{
 const storage=memory();let calls=0
 const weather=createWeather({storage,now:()=>instant,fetcher:async()=>{calls++;return Response.json(forecast)}})
 await weather.ingest('synthetic-a',{latitude:1,longitude:1,source:'bridge',observedAt:'2026-09-26T09:00:00Z'})
 const result=await weather.read('synthetic-a',prefs)
 assert.equal(result.location.source,'manual');assert.equal(result.status,'fresh')
 const disabled=await weather.read('synthetic-a',{...prefs,weather:{...prefs.weather,enabled:false}})
 assert.equal(disabled.status,'unavailable');assert.equal(calls,1)
})
test('malformed response and timeout are bounded weather failures, not planner errors',async()=>{
 const broken=createWeather({storage:memory(),now:()=>instant,fetcher:async()=>Response.json({current:{}})})
 assert.equal((await broken.read('synthetic-a',prefs)).status,'unavailable')
 const timed=createWeather({storage:memory(),now:()=>instant,timeoutMs:10,fetcher:(_url,{signal})=>new Promise((_resolve,reject)=>{
  const keepAlive=setTimeout(()=>reject(Error('test hang guard')),1000)
  signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(signal.reason)},{once:true})
 })})
 assert.equal((await timed.read('synthetic-a',prefs)).status,'unavailable')
})
