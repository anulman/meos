// SPDX-License-Identifier: Apache-2.0
import {JsonTransport} from './transport'
import {ApplicationClient} from './generated'
import {schemas,validateSchema} from '../../../backend/contract.mjs'
import type {Bootstrap} from './generated'
import {RepositoryError} from '../backend-contracts'
let sessionGeneration=0, sessionEpoch:string|undefined
const authChannel=typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel('meos-session-boundary'):undefined
authChannel?.addEventListener('message',()=>window.dispatchEvent(new Event('meos-session-ended')))
const identityVersion=()=>typeof window==='undefined'?'':window.localStorage.getItem('meos-auth-generation')??''
export function announceSessionChange(){window.localStorage.setItem('meos-auth-generation',crypto.randomUUID());authChannel?.postMessage('changed')}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key==='meos-auth-generation')window.dispatchEvent(new Event('meos-session-ended'))})
export let session: {user:{id:string};csrf:string}|undefined
export const transport=new JsonTransport('/api/meos/v1',()=>session?.csrf,async(...args)=>{
 if(sessionEpoch===undefined)throw new RepositoryError('unauthenticated','Session has not been established')
 if(sessionEpoch!==identityVersion()){window.dispatchEvent(new Event('meos-session-ended'));throw Error('Session identity changed')}
 const response=await fetch(...args)
 if(response.status===401){transport.invalidateSession();session=undefined;window.dispatchEvent(new Event('meos-session-ended'))}
 return response
},identityVersion)
export const application=new ApplicationClient(transport)
export async function loadSession(){
 const generation=sessionGeneration,epoch=identityVersion();const previous=session?.user.id
 const response=await fetch('/api/meos/v1/session',{credentials:'same-origin',cache:'no-store',redirect:'error'})
 if(!response.ok)throw Error('Session unavailable. Try again.')
 const data=await response.json();if(generation!==sessionGeneration||epoch!==identityVersion()){window.dispatchEvent(new Event('meos-session-ended'));throw Error('Session changed')}if(previous&&previous!==data.user?.id){window.dispatchEvent(new Event('meos-session-ended'));throw Error('Session changed')}session=data.user?data:undefined;sessionEpoch=data.user?epoch:undefined;return session
}
export function fenceSession(){sessionGeneration++;transport.invalidateSession();session=undefined;sessionEpoch=undefined}

export async function loadBootstrap():Promise<Bootstrap>{
 const generation=sessionGeneration,epoch=identityVersion(),previous=session?.user.id
 const response=await fetch('/api/meos/v1/bootstrap',{credentials:'same-origin',cache:'no-store',redirect:'error'})
 if(!response.ok)throw new RepositoryError(response.status===401?'unauthenticated':'unavailable','Could not open your space. Retry connection.')
 const data:Bootstrap=await response.json();validateSchema(schemas.Bootstrap,data)
 if(generation!==sessionGeneration||epoch!==identityVersion()||previous&&previous!==data.user.id){window.dispatchEvent(new Event('meos-session-ended'));throw new RepositoryError('aborted','Session changed')}
 session={user:data.user,csrf:data.csrf};sessionEpoch=epoch;return data
}
