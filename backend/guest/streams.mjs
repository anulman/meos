// SPDX-License-Identifier: Apache-2.0
import {DomainError} from '../domain.mjs'
import {Utf8Decoder} from './platform.mjs'
const dispose=resource=>resource?.[Symbol.dispose]?.()
/** componentize-qjs throws Error{payload: WIT-error}, not the raw variant. */
export function readIncomingText(incoming,maxBytes) {
 const body=incoming.consume();let stream
 try {
  stream=body.stream();const chunks=[];let size=0
  while(true) {
   let chunk
   try{chunk=stream.blockingRead(16384)}catch(error){if(error?.payload?.tag==='closed')break;throw error}
   size+=chunk.length
   if(size>maxBytes)throw new DomainError('validation','Payload too large')
   chunks.push(chunk)
  }
  const bytes=new Uint8Array(size);let at=0
  for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
  return new Utf8Decoder('utf-8',{fatal:true}).decode(bytes)
 }finally{dispose(stream);dispose(body)}
}

/** WASIp2 blocking-write-and-flush accepts at most4096 bytes per call. */
export function writeOutgoingBytes(output,bytes) {
 for(let at=0;at<bytes.length;at+=4096)output.blockingWriteAndFlush(bytes.subarray(at,at+4096))
}
