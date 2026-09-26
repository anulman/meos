// SPDX-License-Identifier: Apache-2.0
import {JsonTransport} from './transport'
import {ApplicationClient} from './generated'
export let session: {user:{id:string};csrf:string}|undefined
export const transport=new JsonTransport('/api/meos/v1',()=>session?.csrf,async(...args)=>{
 const response=await fetch(...args)
 if(response.status===401){transport.invalidateSession();session=undefined;window.dispatchEvent(new Event('meos-session-ended'))}
 return response
})
export const application=new ApplicationClient(transport)
export async function loadSession(){
 const response=await fetch('/api/meos/v1/session',{credentials:'same-origin',cache:'no-store',redirect:'error'})
 if(!response.ok)throw Error('Session unavailable. Try again.')
 const data=await response.json();session=data.user?data:undefined;return session
}
export function fenceSession(){transport.invalidateSession();session=undefined}
