// SPDX-License-Identifier: Apache-2.0
// Private loopback TLS host for the maintained Go notification listener.
import fs from 'node:fs'
import https from 'node:https'
import {unixUpstream} from '../backend/node-web-server.mjs'
import {createNotificationHost,notificationNodeHandler} from '../backend/notification-host.mjs'
function secret(file) {
 const s=fs.lstatSync(file)
 if(!s.isFile()||s.nlink!==1||(s.mode&0o777)!==0o600||s.uid!==process.getuid())throw Error('Private runtime file required')
 return fs.readFileSync(file)
}
const c=JSON.parse(secret(process.argv[2]))
if(Object.keys(c).sort().join(',')!=='backendSocket,certificate,environment,instanceId,key,origin,port,upstreamOrigin'||!Number.isInteger(c.port)||c.port<1024||c.port>65535||c.origin!==`https://localhost:${c.port}`||!['production','acceptance'].includes(c.environment)||!/^[a-f0-9]{32}$/.test(c.instanceId))throw Error('Invalid private endpoint config')
if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/.test(c.upstreamOrigin))throw Error('Exact upstream origin required')
const native=unixUpstream({origin:c.upstreamOrigin,socketPath:c.backendSocket})
const upstream=request=>{const url=new URL(request.url);if(url.origin!==c.origin)throw Error('Foreign origin');const headers=new Headers(request.headers);if(headers.has('Origin'))headers.set('Origin',c.upstreamOrigin);return native(new Request(c.upstreamOrigin+url.pathname,{method:request.method,headers,body:request.body,duplex:'half',signal:request.signal}))}
const response=await upstream(new Request(c.origin+'/api/meos/v1/instance')),identity=await response.json()
if(!response.ok||identity.environment!==c.environment||identity.instanceId!==c.instanceId)throw Error('Backend identity mismatch')
const server=https.createServer({key:secret(c.key),cert:secret(c.certificate),minVersion:'TLSv1.2'},notificationNodeHandler({origin:c.origin,handle:createNotificationHost({origin:c.origin,upstream})}))
server.requestTimeout=10000;server.headersTimeout=10000
server.listen(c.port,'127.0.0.1')
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();server.closeAllConnections()})
