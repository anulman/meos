// SPDX-License-Identifier: Apache-2.0
// The deliberately small platform surface used by our shared handler, not a
// general Fetch/Streams implementation. WASI owns I/O, bounds and cancellation.
export class Utf8Encoder {
 encode(input='') {
  const bytes=[]
  for(const char of String(input)) {
   let cp=char.codePointAt(0)
   if(cp>=0xd800&&cp<=0xdfff)cp=0xfffd
   if(cp<0x80)bytes.push(cp)
   else if(cp<0x800)bytes.push(0xc0|(cp>>6),0x80|(cp&63))
   else if(cp<0x10000)bytes.push(0xe0|(cp>>12),0x80|((cp>>6)&63),0x80|(cp&63))
   else bytes.push(0xf0|(cp>>18),0x80|((cp>>12)&63),0x80|((cp>>6)&63),0x80|(cp&63))
  }
  return new Uint8Array(bytes)
 }
}
export class Utf8Decoder {
 constructor(label='utf-8',{fatal=false,ignoreBOM=false}={}) {
  if(!['utf-8','utf8'].includes(label.toLowerCase()))throw new TypeError('Only UTF-8 is supported')
  this.fatal=fatal;this.ignoreBOM=ignoreBOM
 }
 decode(input=new Uint8Array()) {
  const bytes=ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input)
  let out='',i=0
  const invalid=()=>{if(this.fatal)throw new TypeError('Invalid UTF-8');out+='\ufffd'}
  while(i<bytes.length) {
   const b=bytes[i++];let n,cp,min=0x80,max=0xbf
   if(b<0x80){out+=String.fromCharCode(b);continue}
   if(b>=0xc2&&b<=0xdf){n=1;cp=b&31}
   else if(b>=0xe0&&b<=0xef){n=2;cp=b&15;if(b===0xe0)min=0xa0;if(b===0xed)max=0x9f}
   else if(b>=0xf0&&b<=0xf4){n=3;cp=b&7;if(b===0xf0)min=0x90;if(b===0xf4)max=0x8f}
   else{invalid();continue}
   let valid=true
   for(let k=0;k<n;k++) {
    const next=bytes[i]
    if(next===undefined||next<(k===0?min:0x80)||next>(k===0?max:0xbf)){valid=false;break}
    cp=(cp<<6)|(next&63);i++
   }
   if(valid)out+=String.fromCodePoint(cp);else invalid()
  }
  return !this.ignoreBOM&&out.charCodeAt(0)===0xfeff?out.slice(1):out
 }
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function encodeBase64(input) {
 const text=String(input);let result=''
 for(let i=0;i<text.length;i+=3) {
  const a=text.charCodeAt(i),b=text.charCodeAt(i+1),c=text.charCodeAt(i+2)
  if(a>255||b>255||c>255)throw new TypeError('Expected Latin-1')
  const bits=(a<<16)|((b||0)<<8)|(c||0)
  result+=alphabet[(bits>>18)&63]+alphabet[(bits>>12)&63]+(i+1<text.length?alphabet[(bits>>6)&63]:'=')+(i+2<text.length?alphabet[bits&63]:'=')
 }
 return result
}
export function decodeBase64(input) {
 const text=String(input).replace(/[\t\n\f\r ]/g,'')
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?){0,1}$/.test(text))throw new TypeError('Invalid base64')
 let bits=0,count=0,result=''
 for(const c of text.replace(/=+$/,'')) {
  bits=(bits<<6)|alphabet.indexOf(c);count+=6
  if(count>=8){count-=8;result+=String.fromCharCode((bits>>count)&255)}
 }
 return result
}
export class GuestHeaders {
 constructor(values={}) {
  this.values=new Map()
  for(const [key,value] of Array.isArray(values)?values:Object.entries(values))this.append(key,value)
 }
 append(name,value) {
  const key=String(name).toLowerCase(),text=String(value)
  if(!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key)||/[\r\n\0]/.test(text))throw new TypeError('Invalid header')
  const old=this.values.get(key);this.values.set(key,old===undefined?text:old+', '+text)
 }
 get(name){return this.values.get(String(name).toLowerCase())??null}
 entries(){return this.values.entries()}
}
export class GuestResponse {
 constructor(body=null,{status=200,headers={}}={}) {
  if(!Number.isInteger(status)||status<200||status>599)throw new TypeError('Invalid status')
  this.status=status;this.headers=new GuestHeaders(headers);this.bytes=body===null?new Uint8Array():new Utf8Encoder().encode(body)
 }
}
export function installGuestPlatform() {
 Object.assign(globalThis,{TextEncoder:Utf8Encoder,TextDecoder:Utf8Decoder,atob:decodeBase64,btoa:encodeBase64,Response:GuestResponse})
}
