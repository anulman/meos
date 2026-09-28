// SPDX-License-Identifier: Apache-2.0
// Offline verification: network-disabled web process consumes a host-refreshed PUBLIC key set.
import {createPublicKey,verify} from 'node:crypto'
export function createAccessOwner({origin,policy,readKeys,owner,upstream,now=()=>Date.now()/1000}) {
 if(!policy||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(policy.issuer)||! /^[a-f0-9]{64}$/.test(policy.audience)||policy.email!==owner.email||! /^[a-f0-9-]{36}$/.test(policy.ownerId)||typeof owner.password!=='string'||owner.password.length<32)throw Error('Invalid single-owner configuration')
 const denied=()=>new Response('Access denied',{status:403,headers:{'Cache-Control':'no-store'}})
 function authenticated(request){
  try{
   const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token||token.length>16384)return false
   const parts=token.split('.');if(parts.length!==3||parts.some(p=>! /^[A-Za-z0-9_-]+$/.test(p)))return false
   const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url')),time=now()
   if(header.alg!=='RS256'||typeof header.kid!=='string'||header.crit!==undefined||claims.iss!==policy.issuer||!Array.isArray(claims.aud)||!claims.aud.includes(policy.audience)||claims.email!==policy.email||claims.type!=='app'||typeof claims.sub!=='string'||!claims.sub||!Number.isFinite(claims.exp)||claims.exp<=time||!Number.isFinite(claims.iat)||claims.iat>time+30||!Number.isFinite(claims.nbf)||claims.nbf>time+30)return false
   const bundle=readKeys();if(bundle.issuer!==policy.issuer||!Number.isFinite(bundle.fetchedAt)||bundle.fetchedAt>time+30||time-bundle.fetchedAt>86400||!Array.isArray(bundle.keys))return false
   const matches=bundle.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));if(matches.length!==1)return false
   return verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:matches[0],format:'jwk'}),Buffer.from(parts[2],'base64url'))
  }catch{return false}
 }
 return {
  check:request=>authenticated(request)?undefined:denied(),
  // Called only after check. Never accept an application password from a browser.
  async session(request){
   const url=new URL(request.url)
   if(url.pathname==='/api/auth/v1/login')return new Response('Not found',{status:404})
   if(!['/api/meos/v1/session','/api/meos/v1/bootstrap'].includes(url.pathname)||request.method!=='GET'){
    if(url.pathname.startsWith('/api/meos/')&&!['/api/meos/v1/mcp','/api/meos/v1/bridge'].includes(url.pathname)&&!url.pathname.startsWith('/api/meos/v1/bridge/')){
     const probe=await upstream(new Request(origin+'/api/meos/v1/session',{headers:{Cookie:request.headers.get('Cookie')??''}}));const data=probe.ok?await probe.json():null
     if(data?.user?.id!==policy.ownerId)return new Response(JSON.stringify({error:{code:'unauthenticated',message:'Owner session required'}}),{status:401,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
    }
    return undefined
   }
   if(url.search||request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.has('Origin')&&request.headers.get('Origin')!==origin))return denied()
   const probe=await upstream(new Request(origin+'/api/meos/v1/session',{headers:{Cookie:request.headers.get('Cookie')??''}}));const data=probe.ok?await probe.json():null
   if(data?.user?.id===policy.ownerId)return undefined
   // Session endpoint is also the renewal path; the external identity is reverified each time.
   const login=await upstream(new Request(origin+'/api/auth/v1/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(owner)}))
   if(![200,303].includes(login.status))throw Error('Owner session unavailable')
   const cookies=login.headers.getSetCookie();if(cookies.length!==2||new Set(cookies.map(c=>c.split('=')[0])).size!==2||!cookies.every(c=>/^(auth_token|refresh_token)=[A-Za-z0-9._~+/-]+={0,2};/.test(c)))throw Error('Invalid owner session')
   const cookie=cookies.map(c=>c.split(';')[0]).join('; ')
   const result=await upstream(new Request(origin+url.pathname,{headers:{Cookie:cookie}}));const session=await result.json();if(!result.ok||session?.user?.id!==policy.ownerId)throw Error('Owner identity mismatch')
   const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'})
   for(const raw of cookies){const age=raw.split(';').map(p=>p.trim()).find(p=>/^max-age=/i.test(p))?.slice(8);if(!/^\d+$/.test(age??'')||Number(age)>31536000)throw Error('Invalid owner cookie lifetime');headers.append('Set-Cookie',raw.split(';')[0]+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+age)}
   return new Response(JSON.stringify(session),{headers})
  }
 }
}
