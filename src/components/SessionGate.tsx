// SPDX-License-Identifier: Apache-2.0
import {useEffect,useState,type ReactNode} from 'react'
import {getConfig} from '../lib/config'
import {loadSession,fenceSession,session} from '../lib/backend/session'
import {clearRepository,getPreferences} from '../lib/backend/ui-repository'
import {queryClient} from '../lib/store'
import {PlannerClockProvider} from '../lib/planner-clock'
export function SessionGate({children}:{children:ReactNode}){
 const [state,setState]=useState<'loading'|'login'|'ready'>('loading'),[error,setError]=useState(''),[preferences,setPreferences]=useState({timezone:getConfig().timezone,weekStartsOn:1 as 0|1})
 async function boot(){try{const current=await loadSession();if(!current){setState('login');return}const prefs=await getPreferences();setPreferences({...prefs,weekStartsOn:prefs.weekStartsOn as 0|1});setState('ready')}catch(e){setError(String(e));setState('login')}}
 useEffect(()=>{if(getConfig().demo){setState('ready');return}void boot();const ended=()=>{fenceSession();clearRepository();void queryClient.cancelQueries();queryClient.clear();window.location.reload()};window.addEventListener('meos-session-ended',ended);return()=>window.removeEventListener('meos-session-ended',ended)},[])
 if(state==='loading')return <p role="status">Opening your space…</p>
 if(state==='login')return <main className="settings-card"><h1>Sign in to MeOS</h1><form onSubmit={async e=>{e.preventDefault();setError('');const form=new FormData(e.currentTarget);try{const response=await fetch('/api/auth/v1/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:String(form.get('email')),password:String(form.get('password'))}),credentials:'same-origin'});if(!response.ok)throw Error('Sign-in failed. Check your email and password.');window.location.reload()}catch(e){setError(String(e))}}}><label>Email<input type="email" name="email" required autoComplete="username"/></label><label>Password<input type="password" name="password" required autoComplete="current-password"/></label><button>Sign in</button></form>{error&&<p role="alert">{error}</p>}<button onClick={()=>void boot()}>Retry connection</button></main>
 return <PlannerClockProvider initialPreferences={preferences}>{!getConfig().demo&&<button className="quiet-action" onClick={async()=>{try{const response=await fetch('/api/meos/auth/logout',{method:'POST',headers:{'X-CSRF-Token':session?.csrf??''},credentials:'same-origin'});if(!response.ok)throw Error('Sign-out failed. Try again.');fenceSession();clearRepository();await queryClient.cancelQueries();queryClient.clear();window.location.reload()}catch(e){setError(String(e))}}}>Sign out</button>}{error&&<p role="alert">{error}</p>}{children}</PlannerClockProvider>
}
