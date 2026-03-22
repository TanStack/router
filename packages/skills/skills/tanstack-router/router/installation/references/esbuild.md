---
name: esbuild-installation
---

# ESBuild Installation

Setting up TanStack Router with ESBuild bundler.

## Installation

```bash
npm install @tanstack/react-router @tanstack/react-router-devtools
npm install -D @tanstack/router-plugin esbuild
```

## ESBuild Configuration

```ts
// build.ts
import esbuild from 'esbuild'
import { tanstackRouter } from '@tanstack/router-plugin/esbuild'

esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outdir: 'dist',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
  ],
})
```

## Watch Mode

```ts
import esbuild from 'esbuild'
import { tanstackRouter } from '@tanstack/router-plugin/esbuild'

const ctx = await esbuild.context({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outdir: 'dist',
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
  ],
})

await ctx.watch()
```

## Configuration Options

```ts
tanstackRouter({
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  routeFileIgnorePrefix: '-',
  quoteStyle: 'single',
})
```

## Project Structure

```
src/
├── routes/
│   ├── __root.tsx
│   ├── index.tsx
│   └── about.tsx
├── routeTree.gen.ts    # Auto-generated
└── main.tsx
```

## Ignoring Generated Files

Add to `.prettierignore`, `.eslintignore`:

```
routeTree.gen.ts
```
