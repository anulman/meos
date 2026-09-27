// SPDX-License-Identifier: Apache-2.0
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {schemas,resourceSchemas,operations} from '../backend/contract.mjs'
const ref=name=>({$ref:'#/components/schemas/'+name})
const response=schema=>({description:'Success',content:{'application/json':{schema}}})
const request=schema=>({required:true,content:{'application/json':{schema}}})
const errors=Object.fromEntries([401,403,404,409,422,503].map(code=>[code,{description:'Typed application error',content:{'application/json':{schema:ref('Error')}}}]))
const security=[{browserSession:[],csrf:[]}],paths={}
for(const [name,op]of Object.entries(operations))paths['/api/meos/v1/operations/'+name]={post:{operationId:name,description:op.description,security,requestBody:request(op.input),responses:{200:response(op.output),...errors},'x-mcp-scope':op.scope}}
for(const [kind,name]of Object.entries(resourceSchemas)){
 paths['/api/meos/v1/resources/'+kind]={get:{operationId:'list_'+kind,security:[{browserSession:[]}],parameters:[{name:'cursor',in:'query',schema:ref('UUID')},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:250}}],responses:{200:response({type:'object',properties:{items:{type:'array',items:ref(name+'Envelope')},nextCursor:ref('UUID')},required:['items'],additionalProperties:false}),...errors}},post:{operationId:'create_'+kind,security,requestBody:request({type:'object',properties:{value:ref(name)},required:['value'],additionalProperties:false}),responses:{201:response(ref(name+'Envelope')),...errors}}}
 paths['/api/meos/v1/resources/'+kind+'/{id}']={parameters:[{name:'id',in:'path',required:true,schema:ref('UUID')}],get:{operationId:'get_'+kind,security:[{browserSession:[]}],responses:{200:response(ref(name+'Envelope')),...errors}},put:{operationId:'update_'+kind,security,requestBody:request({type:'object',properties:{value:ref(name),expectedRevision:{type:'integer',minimum:1}},required:['value','expectedRevision'],additionalProperties:false}),responses:{200:response(ref(name+'Envelope')),...errors}}}
}
paths['/api/meos/v1/preferences']={get:{operationId:'get_preferences',security:[{browserSession:[]}],responses:{200:response(ref('PreferencesEnvelope')),...errors}},put:{operationId:'save_preferences',security,requestBody:request({type:'object',properties:{value:ref('Preferences'),expectedRevision:{type:'integer',minimum:0}},required:['value','expectedRevision'],additionalProperties:false}),responses:{200:response(ref('PreferencesEnvelope')),...errors}}}
const envelopeRequest=(name)=>({type:'object',properties:{value:ref(name),expectedRevision:{type:'integer',minimum:0}},required:['value','expectedRevision'],additionalProperties:false})
for(const [route,name]of [['occurrence','Occurrence'],['period-note','PeriodNote']])paths['/api/meos/v1/commands/'+route]={post:{operationId:'save_'+route.replace('-','_'),security,requestBody:request(envelopeRequest(name)),responses:{200:response(ref(name+'Envelope')),...errors}}}
paths['/api/meos/v1/commands/archive-project/{id}']={parameters:[{name:'id',in:'path',required:true,schema:ref('UUID')}],post:{operationId:'archive_project',security,requestBody:request({type:'object',properties:{expectedRevision:{type:'integer',minimum:1},value:{type:'null'}},required:['expectedRevision'],additionalProperties:false}),responses:{200:response({type:'object',properties:{project:ref('ProjectEnvelope'),affectedTaskIds:{type:'array',items:ref('UUID')}},required:['project','affectedTaskIds'],additionalProperties:false}),...errors}}}
paths['/api/meos/v1/resources/outcomes/{id}'].delete={operationId:'remove_outcome',security,parameters:[{name:'revision',in:'query',required:true,schema:{type:'integer',minimum:1}}],responses:{204:{description:'Removed'},...errors}}
paths['/api/meos/v1/session']={get:{operationId:'get_session',responses:{200:response({anyOf:[{type:'object',properties:{user:{type:'null'}},required:['user'],additionalProperties:false},{type:'object',properties:{user:{type:'object',properties:{id:ref('UUID')},required:['id'],additionalProperties:false},csrf:{type:'string'}},required:['user','csrf'],additionalProperties:false}]})}}}
paths['/api/meos/v1/instance']={get:{operationId:'get_instance',responses:{200:response({type:'object',properties:{instanceId:{type:'string',pattern:'^[a-f0-9]{32}$'},environment:{enum:['acceptance','production']}},required:['instanceId','environment'],additionalProperties:false}),...errors}}}
paths['/api/meos/v1/weather']={get:{operationId:'get_weather',security:[{browserSession:[]}],responses:{200:response(ref('Weather')),...errors}}}
paths['/api/meos/v1/calendar-cache']={get:{operationId:'get_calendar_cache',security:[{browserSession:[]}],responses:{200:response(ref('CalendarCache')),...errors}}}
const spec={openapi:'3.1.0',jsonSchemaDialect:'https://json-schema.org/draft/2020-12/schema',info:{title:'MeOS application contract',version:'0.2.0',description:'Planner contract. Browser transport uses same-origin native session and CSRF. MCP uses separate owner-bound native identities at /api/meos/v1/mcp; not a raw database API.'},paths,components:{schemas,securitySchemes:{browserSession:{type:'apiKey',in:'cookie',name:'auth_token'},csrf:{type:'apiKey',in:'header',name:'X-CSRF-Token'}}}}
const ts=s=>s.$ref?s.$ref.split('/').at(-1):s.anyOf?s.anyOf.map(ts).join(' | '):s.enum?s.enum.map(x=>JSON.stringify(x)).join(' | '):'const'in s?JSON.stringify(s.const):s.type==='object'?'{ '+Object.entries(s.properties??{}).map(([k,v])=>JSON.stringify(k)+(s.required?.includes(k)?'':'?')+': '+ts(v)).join('; ')+(s.additionalProperties?(Object.keys(s.properties??{}).length?'; ':'')+'[key: string]: '+(s.additionalProperties===true?'unknown':ts(s.additionalProperties)):'')+' }':s.type==='array'?'Array<'+ts(s.items)+'>':s.type==='integer'||s.type==='number'?'number':s.type==='null'?'null':s.type??'unknown'
let types='// SPDX-License-Identifier: Apache-2.0\n// Generated by scripts/generate-contract.mjs. Do not edit.\n'+Object.entries(schemas).map(([name,s])=>'export type '+name+' = '+ts(s)).join('\n')+'\n'
types+='export type Operations = {\n'+Object.entries(operations).map(([name,op])=>' '+name+': { input: '+ts(op.input)+'; output: '+ts(op.output)+' }').join('\n')+'\n}\n'
types+=`
export interface ApplicationTransport {
 request<T>(path: string, decode: (value: unknown) => T, options: { method?: 'GET'|'POST'|'PUT'|'DELETE'; body?: unknown; signal?: AbortSignal }): Promise<T>
}
/** Inject the existing JsonTransport: preserves CSRF, logout fencing and redirect rejection. */
export class ApplicationClient {
 private readonly http: ApplicationTransport
 constructor(http: ApplicationTransport) { this.http = http }
 call<K extends keyof Operations>(operation: K, input: Operations[K]['input'], signal?: AbortSignal): Promise<Operations[K]['output']> {
  validateSchema(operationSchemas[operation].input, input)
  return this.http.request('/operations/' + operation, value => {
   validateSchema(operationSchemas[operation].output, value)
   return value as Operations[K]['output']
  }, { method: 'POST', body: input, signal })
 }
}
`
types="import {operations as operationSchemas, validateSchema} from '../../../backend/contract.mjs'\n"+types

for(const [file,content]of [['../docs/openapi.json',JSON.stringify(spec,null,2)+'\n'],['../src/lib/backend/generated.ts',types]]){
 const path=new URL(file,import.meta.url)
 if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==content)throw Error('Generated contract drift: '+path.pathname)}else writeFileSync(path,content)
}
