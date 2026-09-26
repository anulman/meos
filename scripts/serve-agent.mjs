// SPDX-License-Identifier: Apache-2.0
// Explicit separate machine endpoint; does not bypass or alter browser Access.
import fs from 'node:fs'
import http from 'node:http'
import {unixUpstream} from '../backend/node-web-server.mjs'
import {createNotificationHost,notificationNodeHandler} from '../backend/notification-host.mjs'
const config=JSON.parse(fs.readFileSync('/run/meos-agent/runtime.json','utf8'))
if(Object.keys(config).some(k=>!['origin','instanceId','environment','backendSocket'].includes(k))||!/^https:\/\/[a-z0-9.-]+$/.test(config.origin)||!['production','acceptance'].includes(config.environment)||!/^[a-f0-9]{32}$/.test(config.instanceId))throw Error('Invalid agent endpoint config')
if(process.env.LISTEN_FDS!=='1'||process.env.LISTEN_PID!==String(process.pid))throw Error('One supervised socket required')
const upstream=unixUpstream({origin:config.origin,socketPath:config.backendSocket})
const probe=await upstream(new Request(config.origin+'/api/meos/v1/instance')),identity=await probe.json()
if(!probe.ok||identity.environment!==config.environment||identity.instanceId!==config.instanceId)throw Error('Backend identity mismatch')
const server=http.createServer(notificationNodeHandler({origin:config.origin,handle:createNotificationHost({origin:config.origin,upstream})}));server.requestTimeout=10000;server.headersTimeout=10000;server.listen({fd:3})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();server.closeAllConnections()})
