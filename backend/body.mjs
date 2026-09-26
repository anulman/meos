// SPDX-License-Identifier: Apache-2.0
import { DomainError } from './domain.mjs'
/** Enforces the byte bound during reading, not only after allocating an untrusted body. */
export async function boundedText(message,maxBytes) {
 if(!message.body)return ''
 const reader=message.body.getReader(),chunks=[]
 let size=0
 try {
  while(true){
   const {value,done}=await reader.read();if(done)break
   size+=value.byteLength
   if(size>maxBytes){await reader.cancel();throw new DomainError('validation','Payload too large')}
   chunks.push(value)
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes)
}
