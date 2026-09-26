// SPDX-License-Identifier: Apache-2.0
// Synthetic JWTs exist ONLY in the isolated test namespace; no production signing keys.
import {generateKeyPairSync,sign} from 'node:crypto'
export function syntheticAccess(email,ownerId){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),now=Math.floor(Date.now()/1000)
 const policy={issuer:'https://synthetic.cloudflareaccess.com',audience:'a'.repeat(64),email,ownerId}
 const parts=[{alg:'RS256',kid:'synthetic'},{iss:policy.issuer,aud:[policy.audience],email,sub:'synthetic',type:'app',iat:now,nbf:now,exp:now+3600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url'))
 return {policy,keys:{issuer:policy.issuer,fetchedAt:now,keys:[{...publicKey.export({format:'jwk'}),kid:'synthetic'}]},token:parts.join('.')+'.'+sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url')}
}
