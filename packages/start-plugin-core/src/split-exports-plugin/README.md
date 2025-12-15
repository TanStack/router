# Split-Exports Plugin

A Vite plugin that automatically optimizes imports by rewriting them with query strings to enable dead code elimination. This prevents server-only code from leaking into client bundles.

## How It Works

The plugin operates in two phases:

### Phase 1: Import Rewriting

When a file imports from another module, the plugin rewrites the import to include a query parameter listing which exports are actually used.

**Before:**

```ts
// routes/users.tsx
import { formatUser, getUser } from '../utils/user'
```

**After:**

```ts
// routes/users.tsx
import {
  formatUser,
  getUser,
} from '../utils/user?tss-split-exports=formatUser,getUser'
```

### Phase 2: Export Transformation

When a module is loaded with the `?tss-split-exports` query, the plugin transforms it to only export the requested symbols. Unrequested exports are converted to local declarations, and dead code elimination removes any code that becomes unreferenced.

## Example: Separating Server and Client Code

Consider a utility file that exports both isomorphic and server-only code:

```ts
// utils/user.ts
import { db } from './db'

// Isomorphic - safe for client
export const formatUser = (user: { name: string }) => {
  return user.name.toUpperCase()
}

// Server-only - uses database
export const getUser = async (id: string) => {
  return db.users.findOne({ id })
}

// Server-only - uses database
export const deleteUser = async (id: string) => {
  return db.users.delete({ id })
}
```

And a route that only uses `formatUser`:

```ts
// routes/profile.tsx
import { formatUser } from '../utils/user'

export const Route = createFileRoute('/profile')({
  component: () => <div>{formatUser({ name: 'john' })}</div>,
})
```

**What happens:**

1. The import is rewritten to:

   ```ts
   import { formatUser } from '../utils/user?tss-split-exports=formatUser'
   ```

2. When `utils/user.ts?tss-split-exports=formatUser` is loaded, it's transformed to:

   ```ts
   // Isomorphic - safe for client
   export const formatUser = (user: { name: string }) => {
     return user.name.toUpperCase()
   }
   ```

3. The `db` import, `getUser`, and `deleteUser` are all eliminated because they're no longer referenced.

**Result:** The client bundle only contains `formatUser`. The database code never reaches the browser.

## What Gets Skipped

The plugin intentionally skips certain import/export patterns:

| Pattern                  | Example                               | Reason                                          |
| ------------------------ | ------------------------------------- | ----------------------------------------------- |
| npm packages             | `import { useState } from 'react'`    | External packages handle their own tree-shaking |
| Type-only imports        | `import type { User } from './types'` | Types are erased at compile time                |
| Namespace imports        | `import * as utils from './utils'`    | Can't determine which exports are used          |
| Side-effect-only imports | `import './polyfill'`                 | No specifiers to track                          |
| Wildcard re-exports      | `export * from './other'`             | Can't enumerate exports statically              |

## Configuration

```ts
splitExportsPlugin({
  // Enable/disable the plugin (default: true)
  enabled: true,

  // Paths to exclude from transformation
  exclude: ['generated', /\.test\./],

  // Function to get resolved Start config (for srcDirectory filtering)
  getConfig: () => ({ resolvedStartConfig }),
})
```

Debug logging can be enabled by setting the environment variable `TSR_VITE_DEBUG=split-exports` or `TSR_VITE_DEBUG=true`.

## File Structure

- `plugin.ts` - Main Vite plugin with four sub-plugins (import rewriter, resolver, export transformer, HMR)
- `compiler.ts` - AST transformation logic using Babel
- `query-utils.ts` - Query string parsing and manipulation for module IDs
- `plugin-utils.ts` - Utility functions for path handling and filtering
