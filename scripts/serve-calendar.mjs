// SPDX-License-Identifier: Apache-2.0
// Calendar service has only its private state and OAuth credential, never planner DB/password.
import fs from 'node:fs';import http from 'node:http';
import {openCalendarDurableStore} from '../backend/calendar-durable-store.mjs';
import {createCalendarService} from '../backend/calendar-service.mjs';
import {createGoogleBroker} from '../backend/calendar-google-broker.mjs';
import {createPinnedGoogleFetch} from '../backend/calendar-pinned-fetch.mjs';
import {createCalendarRpcHandler} from '../backend/calendar-rpc.mjs';
const config=JSON.parse(fs.readFileSync('/run/meos-calendar/config.json','utf8'));
const secret=JSON.parse(fs.readFileSync('/run/meos-calendar/oauth.json','utf8'));
if(process.getuid()===0||process.env.LISTEN_FDS!=='1'||process.env.LISTEN_PID!==String(process.pid))throw Error('calendar_runtime_identity');
const broker=createGoogleBroker({...config,...secret,fetcher:createPinnedGoogleFetch(config.googlePins)});
const store=openCalendarDurableStore({directory:'/data/private'});
const service=createCalendarService({config:{...config,clientId:secret.clientId},store,broker});
let running=false;
async function tick(){if(running)return;running=true;try{const status=await service.status({ownerId:config.ownerId});if(status.state==='connected'){await service.initializeManagedCalendar();await service.maintainChannels()}}catch{/* Private errors are never logged. Public status stays explicit about subscriptions. */}finally{running=false}}
http.createServer(createCalendarRpcHandler({service,ownerId:config.ownerId})).listen({fd:3});
const timer=setInterval(()=>void tick(),30000);void tick();
process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0)});
