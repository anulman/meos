import {createRootRoute,HeadContent,Outlet,Scripts} from '@tanstack/react-router'
import '../styles.css'
export const Route=createRootRoute({head:()=>({meta:[{charSet:'utf-8'},{name:'viewport',content:'width=device-width, initial-scale=1'},{title:'MeOS — Your day, with room'}]}),component:Root})
function Root(){return <html lang="en"><head><HeadContent/>{import.meta.env.DEV&&<link rel="stylesheet" href="/virtual:stylex.css"/>}<script src="/config.js"/></head><body><Outlet/><Scripts/></body></html>}
