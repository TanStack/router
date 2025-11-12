import * as esbuild from 'esbuild'
import { solidPlugin } from 'esbuild-plugin-solid'
import { tanstackRouter } from '@tanstack/router-plugin/esbuild'

const isDev = process.argv.includes('--dev')

const ctx = await esbuild.context({
  entryPoints: ['src/main.tsx'],
  outfile: 'dist/main.js',
  bundle: true,
  format: 'esm',
  target: ['esnext'],
  minify: !isDev,
  sourcemap: true,
  plugins: [
    solidPlugin(),
    tanstackRouter({ target: 'solid', autoCodeSplitting: true }),
  ],
})

if (isDev) {
  await ctx.watch()
  await ctx.serve({ servedir: '.', port: 3004 })
  console.log('Server running on http://localhost:3004')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
