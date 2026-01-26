# Path Aliases

Configure import path shortcuts.

## TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["./app/*"],
      "@components/*": ["./app/components/*"],
      "@lib/*": ["./app/lib/*"],
      "@server/*": ["./app/server/*"]
    }
  }
}
```

## Vite Configuration

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'
import path from 'path'

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './app'),
        '@components': path.resolve(__dirname, './app/components'),
        '@lib': path.resolve(__dirname, './app/lib'),
        '@server': path.resolve(__dirname, './app/server'),
      },
    },
  },
})
```

## Usage

```tsx
// Before (relative paths)
import { Button } from '../../../components/ui/Button'
import { db } from '../../lib/db'

// After (aliases)
import { Button } from '@components/ui/Button'
import { db } from '@lib/db'
import { authMiddleware } from '@server/middleware'
```

## Common Alias Patterns

```json
{
  "paths": {
    "~/*": ["./app/*"], // App root
    "@/*": ["./app/*"], // Alternative app root
    "@components/*": ["./app/components/*"],
    "@hooks/*": ["./app/hooks/*"],
    "@lib/*": ["./app/lib/*"],
    "@utils/*": ["./app/utils/*"],
    "@server/*": ["./app/server/*"],
    "@styles/*": ["./app/styles/*"],
    "@types/*": ["./app/types/*"]
  }
}
```

## Server vs Client Aliases

```ts
// app.config.ts
export default defineConfig({
  vite: {
    resolve: {
      alias: {
        // Shared
        '~': path.resolve(__dirname, './app'),

        // Server-only (use carefully)
        '@db': path.resolve(__dirname, './app/server/db'),
      },
    },
  },
})
```

## Troubleshooting

If aliases don't work:

1. **Restart dev server** after config changes
2. **Check both** tsconfig.json AND vite config
3. **Verify paths** are correct relative to config file
4. **IDE restart** may be needed for TypeScript
