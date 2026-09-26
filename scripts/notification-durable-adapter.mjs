// SPDX-License-Identifier: Apache-2.0
// Synthetic qualification adapter only: a durable idempotent queue receipt.
import fs from 'node:fs'
import path from 'node:path'
const directory=process.argv[2],chunks=[];let size=0
for await(const chunk of process.stdin){size+=chunk.length;if(size>8388608)throw Error('limit');chunks.push(chunk)}
const event=JSON.parse(Buffer.concat(chunks));if(!/^[a-f0-9]{48}$/.test(event.id))throw Error('identity')
const target=path.join(directory,event.id+'.json')
if(!fs.existsSync(target)){
 const pending=target+'.pending',fd=fs.openSync(pending,'wx',0o600)
 try{fs.writeFileSync(fd,JSON.stringify(event));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 fs.renameSync(pending,target);const dir=fs.openSync(directory,'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}
}
process.stdout.write(JSON.stringify({id:event.id,accepted:true}))
