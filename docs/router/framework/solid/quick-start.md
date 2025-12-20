---
ref: docs/router/framework/react/quick-start.md
replace: { 'React': 'Solid', 'react': 'solid' }
---

[//]: # 'createAppCommand'

```sh
npx create-tsrouter-app@latest --framework solid
```

[//]: # 'createAppCommand'
[//]: # 'CLIPrompts'

- File-based or code-based route configuration
- TypeScript support
- Toolchain setup
- Git initialization

[//]: # 'CLIPrompts'
[//]: # 'createAppCommandFileBased'

```sh
npx create-tsrouter-app@latest my-app --framework solid --template file-router
```

[//]: # 'createAppCommandFileBased'
[//]: # 'createAppCommandCodeBased'

```sh
npx create-tsrouter-app@latest my-app --framework solid
```

[//]: # 'createAppCommandCodeBased'
[//]: # 'Requirements'

- `solid-js` v1.x.x

[//]: # 'Requirements'
[//]: # 'installCommand'

```sh
npm install @tanstack/solid-router
# or
pnpm add @tanstack/solid-router
#or
yarn add @tanstack/solid-router
# or
bun add @tanstack/solid-router
# or
deno add npm:@tanstack/solid-router
```

[//]: # 'installCommand'
[//]: # 'packageJson'

```json
{
  "dependencies": {
    "@tanstack/solid-router": "^x.x.x"
  }
}
```

[//]: # 'packageJson'
