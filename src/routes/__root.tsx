import {createRootRoute,HeadContent,Link,Outlet,Scripts} from '@tanstack/react-router'
import {QueryClientProvider} from '@tanstack/react-query'
import {queryClient} from '../lib/store'
import * as stylex from '@stylexjs/stylex'
import '../styles.css'
const styles=stylex.create({frame:{maxWidth:'760px',marginInline:'auto',padding:'32px 24px 100px'},brand:{letterSpacing:'-0.06em',fontSize:'32px'}})
export const Route=createRootRoute({head:()=>({meta:[{charSet:'utf-8'},{name:'viewport',content:'width=device-width, initial-scale=1'},{title:'MeOS — A little room for your day'}]}),component:Root})
function Root(){return <html lang="en"><head><HeadContent/>{import.meta.env.DEV && <link rel="stylesheet" href="/virtual:stylex.css"/>}<script src="/config.js"/></head><body><QueryClientProvider client={queryClient}><div {...stylex.props(styles.frame)}><header><Link to="/" {...stylex.props(styles.brand)}>meos<span className="brand-dot">.</span></Link><span className="eyebrow">A LITTLE ROOM FOR YOUR DAY</span></header><p className="demo">Memory-only demo · resets on reload</p><Outlet/><nav aria-label="Main navigation"><Link to="/" activeOptions={{exact:true}}>Today</Link><Link to="/week">Week</Link><Link to="/settings">Settings</Link></nav><footer>Phase 1 · foundation preview</footer></div></QueryClientProvider><Scripts/></body></html>}
