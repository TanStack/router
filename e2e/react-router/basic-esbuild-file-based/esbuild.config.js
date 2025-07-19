import { tanstackRouter } from '@tanstack/router-plugin/esbuild'
import * as esbuild from 'esbuild'

const args = process.argv.slice(2)

const config = {
  entryPoints: ['./src/main.tsx'],
  bundle: true,
  outfile: './dist/main.js',
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
    }),
  ],
  define: {
    NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env.EXTERNAL_PORT': JSON.stringify(
      process.env.NODE_ENV === 'test' ? process.env.EXTERNAL_PORT : '',
    ),
  },
  tsconfig: './tsconfig.json',
}

if (args.includes('--build')) {
  await esbuild.build({
    ...config,
  })
}

const serve = args.find((arg) => arg.startsWith('--serve'))

if (serve) {
  const port = parseInt(serve.split('=')[1])

  const ctx = await esbuild.context({
    ...config,
  })

  if (args.includes('--watch')) {
    await ctx.watch()
  }

  await ctx.serve({
    servedir: '.',
    port,
  })
}
