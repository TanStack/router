---
ref: docs/router/framework/react/installation/with-router-cli.md
---

[//]: # 'AfterScripts'

If you are using TypeScript, you should also add the following options to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js"
  }
}
```

With that, you're all set to start using file-based routing with TanStack Router.

[//]: # 'AfterScripts'
[//]: # 'TargetConfiguration'

Since you are using Solid, you should add the following to your `tsr.config.json` file:

```json
{
  "target": "solid"
}
```

[//]: # 'TargetConfiguration'
