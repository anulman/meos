// SPDX-License-Identifier: Apache-2.0
// Synchronous SHA-256 for the WASI guest (which has no Node/WebCrypto API).
// Input identity is not authentication; owner grants authorize every operation.
const primes=[]
for(let n=2;primes.length<64;n++)if(!primes.some(p=>p*p<=n&&n%p===0))primes.push(n)
const fraction=x=>Math.floor((x-Math.floor(x))*4294967296)>>>0
const initial=primes.slice(0,8).map(p=>fraction(Math.sqrt(p)))
const constants=primes.map(p=>fraction(Math.cbrt(p)))
const rotate=(x,n)=>(x>>>n)|(x<<(32-n))
export function sha256(bytes){
 const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128
 const view=new DataView(padded.buffer);view.setUint32(padded.length-4,bytes.length*8)
 const state=[...initial],words=new Uint32Array(64)
 for(let offset=0;offset<padded.length;offset+=64){
  for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4)
  for(let i=16;i<64;i++){const x=words[i-15],y=words[i-2];words[i]=(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-16]+(rotate(y,17)^rotate(y,19)^(y>>>10))+words[i-7]}
  let [a,b,c,d,e,f,g,h]=state
  for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+constants[i]+words[i])>>>0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0}
  for(const [i,value]of [a,b,c,d,e,f,g,h].entries())state[i]=(state[i]+value)>>>0
 }
 return state.map(n=>n.toString(16).padStart(8,'0')).join('')
}
export const EMBEDDING_INDEX='planning-v1',EMBEDDING_INPUT='utf8-prefix-6000-v1'
export function embeddingInput(value){
 // Slice at a code-point boundary; never synthesize a replacement suffix or strip BOM.
 const bytes=new TextEncoder().encode(value);let end=Math.min(bytes.length,6000)
 while(end<bytes.length&&(bytes[end]&192)===128)end--
 const input=bytes.slice(0,end)
 return {text:new TextDecoder('utf-8',{ignoreBOM:true}).decode(input),inputHash:sha256(input)}
}
