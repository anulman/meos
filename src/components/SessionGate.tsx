// SPDX-License-Identifier: Apache-2.0
import {useEffect,useState,type ReactNode} from 'react'
import {getConfig} from '../lib/config'
import {loadSession,fenceSession,session,announceSessionChange} from '../lib/backend/session'
import {clearRepository,getPreferences,preferencesOptions} from '../lib/backend/ui-repository'
import {queryClient} from '../lib/store'
import {endDataSession,refreshRevisions,type SharedPreferences} from '../lib/loading'
import {useQuery} from '@tanstack/react-query'
import {PlannerClockProvider} from '../lib/planner-clock'
export function SessionGate({children,bootstrap}:{children:ReactNode;bootstrap:{ready:boolean;error?:string;preferences?:SharedPreferences}}){
 const [state,setState]=useState<'loading'|'login'|'ready'>(bootstrap.ready?'ready':'login'),[error,setError]=useState(bootstrap.error??'')
 const {data:prefs}=useQuery({...preferencesOptions,enabled:state==='ready'&&!getConfig().demo})
 const preferences=prefs??bootstrap.preferences??{timezone:getConfig().timezone,weekStartsOn:1 as const}
 async function boot(){window.location.reload()}
 useEffect(()=>{
  if(getConfig().demo)return
  const ended=()=>{setState('login');endDataSession();window.location.reload()}
  const verify=()=>{if(session)void loadSession().then(()=>{void refreshRevisions().catch(()=>{})}).catch(()=>{setState('login');endDataSession();setError('Session unavailable. Retry connection.')})}
  const refresh=()=>{if(document.visibilityState==='visible')void refreshRevisions().catch(()=>{})}
  const timer=window.setInterval(refresh,30_000)
  window.addEventListener('focus',verify);window.addEventListener('meos-session-ended',ended)
  void navigator.serviceWorker?.getRegistrations().then(async registrations=>{if(registrations.length){await Promise.all(registrations.map(registration=>registration.unregister()));window.location.reload()}})
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',verify);window.removeEventListener('meos-session-ended',ended)}
 },[])
 if(state==='loading')return <p role="status">Opening your space…</p>
 if(state==='login'&&getConfig().accessGated)return <main className="settings-card"><h1>Connecting to MeOS</h1><p role="alert">Your access is verified outside MeOS. The app connection is temporarily unavailable.</p><button onClick={()=>void boot()}>Retry connection</button></main>
 if(state==='login')return <main className="settings-card"><h1>Sign in to MeOS</h1><form onSubmit={async e=>{e.preventDefault();setError('');const form=new FormData(e.currentTarget);try{const response=await fetch('/api/auth/v1/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:String(form.get('email')),password:String(form.get('password'))}),credentials:'same-origin'});if(!response.ok)throw Error('Sign-in failed. Check your email and password.');announceSessionChange();window.location.reload()}catch(e){setError(String(e))}}}><label>Email<input type="email" name="email" required autoComplete="username"/></label><label>Password<input type="password" name="password" required autoComplete="current-password"/></label><button>Sign in</button></form>{error&&<p role="alert">{error}</p>}<button onClick={()=>void boot()}>Retry connection</button></main>
 return <PlannerClockProvider initialPreferences={{...preferences,weekStartsOn:preferences.weekStartsOn as 0|1}}>{!getConfig().demo&&!getConfig().accessGated&&<button className="quiet-action" onClick={async()=>{try{const response=await fetch('/api/meos/auth/logout',{method:'POST',headers:{'X-CSRF-Token':session?.csrf??''},credentials:'same-origin'});if(!response.ok)throw Error('Sign-out failed. Try again.');announceSessionChange();fenceSession();clearRepository();await queryClient.cancelQueries();queryClient.clear();window.location.reload()}catch(e){setError(String(e))}}}>Sign out</button>}{error&&<p role="alert">{error}</p>}{children}</PlannerClockProvider>
}
