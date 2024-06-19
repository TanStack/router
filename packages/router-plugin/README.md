<img src="https://static.scarf.sh/a.png?x-pxid=d988eb79-b0fc-4a2b-8514-6a1ab932d188" />

# TanStack Router Plugin

See https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing

## Installation

```bash
npm install -D @tanstack/router-plugin
```

### Usage with vite

```js
// vite.config.js
import { defineConfig } from 'vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    // ...
  ],
})
```
