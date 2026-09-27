// SPDX-License-Identifier: Apache-2.0
// Calendar service has only its private state and OAuth credential, never planner DB/password.
import fs from 'node:fs';import http from 'node:http';
import {openCalendarDurableStore} from '../backend/calendar-durable-store.mjs';
import {createCalendarService} from '../backend/calendar-service.mjs';
import {createGoogleBroker} from '../backend/calendar-google-broker.mjs';
import {createPinnedGoogleFetch} from '../backend/calendar-pinned-fetch.mjs';
import {unixUpstream} from '../backend/node-web-server.mjs';
import {createCalendarPlannerClient} from '../backend/calendar-planner-client.mjs';
import {createCalendarRpcHandler} from '../backend/calendar-rpc.mjs';
const config=JSON.parse(fs.readFileSync('/run/meos-calendar/config.json','utf8'));
const secret=JSON.parse(fs.readFileSync('/run/meos-calendar/oauth.json','utf8'));
if(process.getuid()===0||process.env.LISTEN_FDS!=='1'||process.env.LISTEN_PID!==String(process.pid))throw Error('calendar_runtime_identity');
const broker=createGoogleBroker({...config,...secret,fetcher:createPinnedGoogleFetch(config.googlePins)});
const store=openCalendarDurableStore({directory:'/data/private'});
const initialPlanner=config.plannerEnabled?JSON.parse(fs.readFileSync('/run/meos-calendar/planner.json','utf8')):undefined;
const savedPlanner=store.get('planner-credentials');
if(savedPlanner&&savedPlanner.agentId!==initialPlanner?.agentId)throw Error('planner_principal_changed');
const planner=config.plannerEnabled?createCalendarPlannerClient({origin:config.origin,upstream:unixUpstream({origin:config.origin,socketPath:'/run/meos-planner/backend.sock'}),credentials:savedPlanner??initialPlanner,saveCredentials:value=>store.transaction(tx=>tx.set('planner-credentials',value)),health:store.get('planner-health'),saveHealth:value=>store.transaction(tx=>tx.set('planner-health',value))}):undefined;
const service=createCalendarService({config:{...config,clientId:secret.clientId},store,broker,planner});
http.createServer(createCalendarRpcHandler({service,ownerId:config.ownerId})).listen({fd:3});
let stopped=false,timer;
async function tick(){try{await service.poll()}catch{/* No credentials or raw provider errors in logs. */}finally{if(!stopped)timer=setTimeout(tick,1000)}}
void tick();
process.on('SIGTERM',()=>{stopped=true;clearTimeout(timer);process.exit(0)});
