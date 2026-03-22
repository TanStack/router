---
name: webpack-installation
---

# Webpack Installation

Setting up TanStack Router with Webpack bundler.

## Installation

```bash
npm install @tanstack/react-router @tanstack/react-router-devtools
npm install -D @tanstack/router-plugin
```

## Webpack Configuration

```ts
// webpack.config.ts
import { tanstackRouter } from '@tanstack/router-plugin/webpack'

export default {
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
  ],
}
```

## JavaScript Configuration

```js
// webpack.config.js
const { tanstackRouter } = require('@tanstack/router-plugin/webpack')

module.exports = {
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
  ],
}
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

## VSCode Settings

```json
{
  "files.readonlyInclude": { "**/routeTree.gen.ts": true },
  "files.watcherExclude": { "**/routeTree.gen.ts": true },
  "search.exclude": { "**/routeTree.gen.ts": true }
}
```

## Quickstart Template

```bash
git clone https://github.com/TanStack/router.git
cd router/examples/react/quickstart-webpack-file-based
npm install && npm run dev
```
