---
id: path-aliases
title: Path Aliases
---

Path aliases are a useful feature of TypeScript that allows you to define a shortcut for a path that could be distant in your project's directory structure. This can help you avoid long relative imports in your code and make it easier to refactor your project's structure. This is especially useful for avoiding long relative imports in your code.

By default, TanStack Start does not include path aliases. However, you can easily add them to your project by updating your `tsconfig.json` file in the root of your project and adding the following configuration:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

In this example, we've defined the path alias `~/*` that maps to the `./src/*` directory. This means that you can now import files from the `src` directory using the `~` prefix.

After updating your `tsconfig.json` file, configure your build tool so it resolves the same path aliases.

<!-- ::start:tabs variant="bundler" -->

# Vite

Vite has [built-in support for path aliases](https://vite.dev/config/shared-options#resolve-tsconfigpaths), which is disabled by default. To enable it, add the following configuration to your `vite.config.ts` file:

```ts
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    // This enables built-in support for path aliases defined in tsconfig.json
    tsconfigPaths: true,
  },
})
```

# Rsbuild

Rsbuild reads the `paths` field from `tsconfig.json` by default. No extra config is needed when your aliases live in the root `tsconfig.json`.

If you use a custom tsconfig file, point Rsbuild at it with `source.tsconfigPath`:

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core'

export default defineConfig({
  source: {
    tsconfigPath: './tsconfig.custom.json',
  },
})
```

<!-- ::end:tabs -->

Once this configuration has completed, you'll now be able to import files using the path alias like so:

```ts
// app/routes/posts/$postId/edit.tsx
import { Input } from '~/components/ui/input'

// instead of

import { Input } from '../../../components/ui/input'
```
