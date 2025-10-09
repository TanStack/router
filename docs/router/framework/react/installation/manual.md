---
title: Installation
---

## Requirements

> [!IMPORTANT] The legacy `.render()` function is not supported. If you are using it, please upgrade to `ReactDOM.createRoot` to ensure compatibility.

Before installing TanStack router, please ensure your React project meets the following requirements:

- `react` v18 or later.
- `react-dom` v18 or later.

[//]: # 'Requirements'

While TypeScript is optional, we recommend using it for a better development experience. If you choose to use TypeScript, please ensure you are using `typescript>=v5.3.x`. While we aim to support the last 5 minor versions of TypeScript, using the latest version will help avoid potential issues.

## Installation

```sh
npm install @tanstack/react-router
# or
pnpm add @tanstack/react-router
# or
yarn add @tanstack/react-router
# or
bun add @tanstack/react-router
# or
deno add npm:@tanstack/react-router
```

### LLM Assistance Support

All of our documentation for TanStack React Router is integrated into the NPM module and can be easily installed as LLM rules. You can integrate LLM rules into the editor of your choice using [vibe-rules](https://www.npmjs.com/package/vibe-rules).

```bash
pnpm add -g vibe-rules
```

Then run `vibe-rules` with the editor of your choice. Here is an example for Cursor:

```bash
vibe-rules install cursor
```

But you can also use `windsurf`, `claude-code`, etc. Check the [vibe-rules](https://www.npmjs.com/package/vibe-rules) documentation for more information.

### Usage with yarn workspaces

When using yarn workspaces, you will need to add the following config to the `.yarnrc.yml` of the application using TanStack Router

```yml
pnpFallbackMode: all
pnpMode: loose
```
