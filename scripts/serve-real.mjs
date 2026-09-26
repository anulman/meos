// SPDX-License-Identifier: Apache-2.0
// Socket-activated, network-isolated production proxy. Configuration contains no credentials.
import fs from 'node:fs'
import http from 'node:http'
import {createAccessOwner} from '../backend/access-owner.mjs'
import {createNodeWebHandler,unixUpstream} from '../backend/node-web-server.mjs'
const config=JSON.parse(fs.readFileSync('/run/meos/runtime.json','utf8'))
if(Object.keys(config).some(key=>!['origin','environment','instanceId','access'].includes(key))||config.environment!=='production'||!/^https:\/\/[a-z0-9.-]+$/.test(config.origin)||!/^[a-f0-9]{32}$/.test(config.instanceId))throw Error('Invalid production identity configuration')
if(process.env.LISTEN_FDS!=='1'||process.env.LISTEN_PID!==String(process.pid))throw Error('One systemd-owned listener is required')
const upstream=unixUpstream({origin:config.origin,socketPath:'/run/meos/backend.sock'})
const probe=await upstream(new Request(config.origin+'/api/meos/v1/instance'));const identity=await probe.json();if(!probe.ok||identity.environment!=='production'||identity.instanceId!==config.instanceId)throw Error('Production instance identity mismatch')
const accessOwner=createAccessOwner({origin:config.origin,policy:config.access,owner:JSON.parse(fs.readFileSync('/run/meos/owner.json','utf8')),readKeys:()=>JSON.parse(fs.readFileSync('/run/meos/access-public/keys.json','utf8')),upstream})
http.createServer(createNodeWebHandler({origin:config.origin,root:'/app/client',upstream,accessOwner})).listen({fd:3})
