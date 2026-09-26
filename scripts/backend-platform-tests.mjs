// SPDX-License-Identifier: Apache-2.0
import test from 'node:test'
import assert from 'node:assert/strict'
import {Utf8Encoder,Utf8Decoder,encodeBase64,decodeBase64,GuestHeaders} from '../backend/guest/platform.mjs'

test('guest UTF-8 agrees with standard codecs for Unicode and malformed boundaries',()=>{
 for(const text of ['','ASCII','日本語','café','😀','\ud800','a\udfffz','\ufefftest']) {
  assert.deepEqual(new Utf8Encoder().encode(text),new TextEncoder().encode(text))
 }
 const cases=[[],[0xef,0xbb,0xbf,65],[0xc0,0xaf],[0xe0,0x80,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xe1,0x80,0xff],[0xf0,0x9f],[0xff],Array.from(new TextEncoder().encode('😀日本語'))]
 for(const bytes of cases)for(const ignoreBOM of [false,true]) {
  const input=new Uint8Array(bytes)
  assert.equal(new Utf8Decoder('utf-8',{ignoreBOM}).decode(input),new TextDecoder('utf-8',{ignoreBOM}).decode(input))
  let expected
  try{expected=new TextDecoder('utf-8',{fatal:true,ignoreBOM}).decode(input)}catch{assert.throws(()=>new Utf8Decoder('utf-8',{fatal:true,ignoreBOM}).decode(input));continue}
  assert.equal(new Utf8Decoder('utf-8',{fatal:true,ignoreBOM}).decode(input),expected)
 }
})
test('guest base64 matches native byte encoding; malformed input and header injection rejected',()=>{
 for(let length=0;length<260;length++) {
  const raw=String.fromCharCode(...Array.from({length},(_,i)=>i%256))
  assert.equal(encodeBase64(raw),btoa(raw));assert.equal(decodeBase64(btoa(raw)),raw)
 }
 for(const bad of ['a','====','ab=c','a-b_','a==='])assert.throws(()=>decodeBase64(bad))
 const h=new GuestHeaders([['Origin','https://one.invalid'],['ORIGIN','https://two.invalid']])
 assert.equal(h.get('origin'),'https://one.invalid, https://two.invalid')
 assert.throws(()=>new GuestHeaders({'x-test':'ok\r\nx-evil: yes'}))
})
