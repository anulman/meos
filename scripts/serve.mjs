// Local, loopback-only static acceptance server; never a production server.
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {extname,resolve} from 'node:path'
const root=resolve('dist/client')
createServer(async(req,res)=>{try{let path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/'))path=root+'/_shell.html';let body;try{body=await readFile(path)}catch{path=root+'/_shell.html';body=await readFile(path)}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(body)}catch{res.writeHead(500).end()}}).listen(3181,'127.0.0.1')
