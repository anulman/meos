import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import stylex from '@stylexjs/unplugin/vite'
// Fail closed if a reviewed build-only dependency reaches any output chunk.
const buildOnlyBoundary = {
 name: 'meos-build-only-boundary',
 generateBundle(_options: unknown, bundle: Record<string, any>) {
  for (const chunk of Object.values(bundle)) {
   if (chunk.type !== 'chunk') continue
   for (const id of Object.keys(chunk.modules)) {
    if (/node_modules\/(?:lightningcss(?:-linux-x64-gnu)?|caniuse-lite|argparse)\//.test(id)) {
     throw new Error(`Build-only dependency in delivered chunk: ${id}`)
    }
   }
  }
 },
}
export default defineConfig({plugins:[buildOnlyBoundary,stylex({}),tanstackStart({spa:{enabled:true}}),react()],server:{host:'127.0.0.1'}})
