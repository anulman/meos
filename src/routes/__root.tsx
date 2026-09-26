import {createRootRoute,HeadContent,Link,Outlet,Scripts,useLocation} from '@tanstack/react-router'
import {QueryClientProvider} from '@tanstack/react-query'
import {useEffect,useState} from 'react'
import {queryClient} from '../lib/store'
import {FloatingAdd,ResourceProvider} from '../components'
import * as stylex from '@stylexjs/stylex'
import '../styles.css'
const styles=stylex.create({frame:{maxWidth:'760px',marginInline:'auto',padding:'24px 22px 140px'}})
export const Route=createRootRoute({head:()=>({meta:[{charSet:'utf-8'},{name:'viewport',content:'width=device-width, initial-scale=1'},{title:'MeOS — Your day, with room'}]}),component:Root})
function Root(){const[hydrated,setHydrated]=useState(false);useEffect(()=>setHydrated(true),[]);const location=useLocation();const isWeek=location.pathname==='/week';const showAdd=location.pathname==='/'||isWeek;return <html lang="en"><head><HeadContent/>{import.meta.env.DEV&&<link rel="stylesheet" href="/virtual:stylex.css"/>}<script src="/config.js"/></head><body><QueryClientProvider client={queryClient}><ResourceProvider><div {...stylex.props(styles.frame)}><main id="main-content"><Outlet/></main>{hydrated&&<nav aria-label="Main navigation"><Link to="/" activeOptions={{exact:true}}>Today</Link><Link to="/week">Week</Link><Link to="/settings">Settings</Link></nav>}</div>{hydrated&&<div hidden={!showAdd}><FloatingAdd kind={isWeek?'outcome':'task'}/></div>}</ResourceProvider></QueryClientProvider><Scripts/></body></html>}
