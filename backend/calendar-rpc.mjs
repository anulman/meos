// SPDX-License-Identifier: Apache-2.0
// Private Unix-socket protocol; filesystem/socket ownership is the access boundary.
import {unixUpstream} from './node-web-server.mjs';
const operations=new Set(['status','connect','callback','disconnect','events','editEvent']);
export function createCalendarRpcClient({socketPath,ownerId}){
 const origin='https://calendar.internal.invalid',upstream=unixUpstream({origin,socketPath});
 const call=async(operation,input)=>{const response=await upstream(new Request(origin+'/'+operation,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));if(!response.ok)throw Error('calendar_unavailable');return response.json()};
 return Object.fromEntries([...operations].map(operation=>[operation,input=>call(operation,{...input,ownerId})]));
}
export function createCalendarRpcHandler({service,ownerId}){
 return async(req,res)=>{try{
  const operation=req.url?.slice(1);if(req.method!=='POST'||!operations.has(operation)){res.writeHead(404);res.end();return}
  let size=0,parts=[];for await(const part of req){size+=part.length;if(size>32768)throw Error('too_large');parts.push(part)}
  const input=JSON.parse(Buffer.concat(parts).toString('utf8'));
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_input');
  if(input.ownerId!==ownerId)throw Error('owner_required');
  const result=await service[operation](input);res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result??{}));
 }catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"calendar_unavailable"}')}};
}
