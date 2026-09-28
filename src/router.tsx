import {createRouter} from '@tanstack/react-router'
import {routeTree} from './routeTree.gen'
export function getRouter(){return createRouter({routeTree,scrollRestoration:true,defaultPreload:'intent',defaultPreloadStaleTime:0,defaultPendingMinMs:0,defaultPendingComponent:()=> <p>Opening your day…</p>})}
declare module '@tanstack/react-router' {interface Register {router:ReturnType<typeof getRouter>}}
