import {useEffect,useId,useMemo,useRef,useState} from 'react'
import {Combobox} from '@base-ui/react/combobox'
import {matchesTimezone,timezoneChoices,timezoneCity,timezoneNow,validTimezone} from '../lib/timezones'

export function TimezoneSelect({label,value,onChange}:{label:string;value:string;onChange:(zone:string)=>void}) {
 const id=useId();const input=useRef<HTMLInputElement>(null);const container=useRef<HTMLDivElement>(null)
 const [open,setOpen]=useState(false);const [now,setNow]=useState(Date.now);const [error,setError]=useState('')
 const choices=useMemo(()=>timezoneChoices(value),[value])
 useEffect(()=>{if(!open)return;setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),30_000);return()=>window.clearInterval(timer)},[open])
 const choose=(zone:string|null)=>{if(zone&&validTimezone(zone)){onChange(zone);setError('');setOpen(false)}}
 return <div className="timezone-field" ref={container}><span id={id}>{label}</span>
  <Combobox.Root items={choices} value={validTimezone(value)?value:null} onValueChange={choose} open={open} onOpenChange={setOpen} filter={matchesTimezone}>
   <Combobox.Trigger className="timezone-trigger" aria-labelledby={id} data-timezone={value}><span>{validTimezone(value)?timezoneCity(value):'Choose timezone'}<small>{validTimezone(value)?value:'Select a city or region'}</small></span><span aria-hidden="true">⌄</span></Combobox.Trigger>
   <Combobox.Portal container={container}><Combobox.Positioner sideOffset={4} align="start" className="timezone-positioner">
    <Combobox.Popup className="timezone-popup" initialFocus={input}>
     <Combobox.Input ref={input} aria-label={`Search ${label.toLowerCase()}`} placeholder="Search city or IANA timezone" className="timezone-search"/>
     <p className="timezone-hint">Choose a result to change the timezone. Times shown are current.</p>
     <Combobox.Empty className="timezone-empty">No matching timezone. Try a city or IANA name.</Combobox.Empty>
     <Combobox.List className="timezone-list">{(zone:string)=>{const current=timezoneNow(zone,now);return <Combobox.Item key={zone} value={zone} className="timezone-option"><span><strong>{timezoneCity(zone)}</strong><small>{zone}</small></span><span className="timezone-local"><strong>{current.offset}</strong><small>{current.time} local</small></span></Combobox.Item>}}</Combobox.List>
    </Combobox.Popup>
   </Combobox.Positioner></Combobox.Portal>
  </Combobox.Root>
  <button className="quiet-action timezone-device" type="button" onClick={()=>{const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(validTimezone(zone))choose(zone);else setError('Device timezone unavailable. Choose a city instead.')}}>Use device timezone</button>
  {error&&<p role="alert">{error}</p>}
 </div>
}
