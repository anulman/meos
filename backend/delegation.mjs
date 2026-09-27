// SPDX-License-Identifier: Apache-2.0
// Native identity is supplied by the runtime, never by request arguments.
export function delegatedPrincipal(db, identity, time) {
 if(db.query('SELECT 1 FROM _meos_bridge_binding WHERE bridge_id=?',[identity]).length)return null
 const row=db.query('SELECT owner_id,scopes,expires_at,revoked FROM _meos_agent_grants WHERE agent_id=?',[identity])[0]
 // A revoked/expired service identity must never fall through to owner access.
 if(row)return {owner:row[0],scopes:JSON.parse(row[1]),active:!Number(row[3])&&Number(row[2])>time,delegated:false}
 if(!db.query('SELECT 1 FROM _user WHERE id=?',[identity]).length)return null
 return {owner:identity,scopes:['agenda:read','planning:read','tasks:write','routines:write','occurrences:write','schedule:read','schedule:write','notifications:consume','search:read','search:index'],active:true,delegated:true}
}
