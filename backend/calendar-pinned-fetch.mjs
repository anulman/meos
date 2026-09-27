// SPDX-License-Identifier: Apache-2.0
// TLS keeps the Google hostname/SNI while DNS is a reviewed deployment-time pin.
import https from 'node:https';import net from 'node:net';import {Readable} from 'node:stream';
const HOSTS=['oauth2.googleapis.com','www.googleapis.com'];
export function createPinnedGoogleFetch(pins){
 if(!pins||Object.keys(pins).length!==2||HOSTS.some(h=>!Array.isArray(pins[h])||!pins[h].length||pins[h].some(ip=>net.isIP(ip)!==4)))throw Error('invalid_google_pins');
 return async(url,options={})=>{
  const target=new URL(url);if(target.protocol!=='https:'||target.port||target.username||target.password||!HOSTS.includes(target.hostname)||options.redirect!=='error')throw Error('target_denied');
  return new Promise((resolve,reject)=>{
   const request=https.request(target,{method:options.method??'GET',headers:options.headers,signal:options.signal,lookup:(hostname,options,callback)=>{if(hostname!==target.hostname){callback(Error('dns_denied'));return}const address=pins[hostname][0];callback(null,options?.all?[{address,family:4}]:address,4)}},response=>{
    if(response.statusCode>=300&&response.statusCode<400){response.destroy();reject(Error('redirect_denied'));return}
    resolve(new Response([204,304].includes(response.statusCode)?null:Readable.toWeb(response),{status:response.statusCode,headers:response.headers}));
   });request.on('error',()=>reject(Error('google_unavailable')));request.end(options.body);
  });
 };
}
