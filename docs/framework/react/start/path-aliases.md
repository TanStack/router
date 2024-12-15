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
      "~/*": ["app/*"]
    }
  }
}
```

In this example, we've defined the path alias `~/*` that maps to the `app/*` directory. This means that you can now import files from the `app` directory using the `~` prefix.

After updating your `tsconfig.json` file, you'll need to install the `vite-tsconfig-paths` plugin to enable path aliases in your TanStack Start project. You can do this by running the following command:

```sh
npm install -D vite-tsconfig-paths
```

Now, you'll need to update your `app.config.ts` file to include the following:

```ts
// app.config.ts
import { defineConfig } from '@tanstack/start/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  vite: {
    plugins: [
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
})
```

Once this configuration has completed, you'll now be able to import files using the path alias like so:

```ts
// app/routes/posts/$postId/edit.tsx
import { Input } from '~/components/ui/input'

// instead of

import { Input } from '../../../components/ui/input'
```
