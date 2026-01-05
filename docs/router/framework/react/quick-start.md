---
id: quick-start
title: Quick Start
---

## Impatient?

The fastest way to get started with TanStack Router is to scaffold a new project. Just run:

[//]: # 'createAppCommand'

```sh
npx create-tsrouter-app@latest
```

[//]: # 'createAppCommand'

The CLI will guide you through a short series of prompts to customize your setup, including options for:

[//]: # 'CLIPrompts'

- File-based or code-based route configuration
- TypeScript support
- Tailwind CSS integration
- Toolchain setup
- Git initialization

[//]: # 'CLIPrompts'

Once complete, a new React project will be generated with TanStack Router installed and ready to use:

```sh
cd your-project-name
npm run dev
```

> [!TIP]
> For full details on available options and templates, visit the [`create-tsrouter-app` documentation](https://github.com/TanStack/create-tsrouter-app/tree/main/cli/create-tsrouter-app).

## Routing Options

TanStack Router supports both file-based and code-based route configurations. You can specify your preference during the CLI setup, or use these commands directly:

### File-Based Route Generation

The file-based approach is the recommended option for most projects. It automatically creates routes based on your file structure, giving you the best mix of performance, simplicity, and developer experience.

[//]: # 'createAppCommandFileBased'

```sh
npx create-tsrouter-app@latest my-app --template file-router
```

[//]: # 'createAppCommandFileBased'

### Code-Based Route Configuration

If you prefer to define routes programmatically, you can use the code-based route configuration. This approach gives you full control over routing logic.

[//]: # 'createAppCommandCodeBased'

```sh
npx create-tsrouter-app@latest my-app
```

[//]: # 'createAppCommandCodeBased'

With either approach, navigate to your project directory and start the development server:

```sh
cd my-app
npm run dev
```

## Existing Project

If you have an existing React project and want to add TanStack Router to it, you can install it manually.

### Requirements

Before installing TanStack Router, please ensure your project meets the following requirements:

[//]: # 'Requirements'

- `react` v18 or later with `createRoot` support.
- `react-dom` v18 or later.

[//]: # 'Requirements'

> [!NOTE]
> Using TypeScript (`v5.3.x or higher`) is recommended for the best development experience, though not strictly required. We aim to support the last 5 minor versions of TypeScript, but using the latest version will help avoid potential issues.

TanStack Router is currently only compatible with React (with ReactDOM) and Solid. If you're interested in contributing to support other frameworks, such as React Native, Angular, or Vue, please reach out to us on [Discord](https://tlinz.com/discord).

### Installation

To install TanStack Router in your project, run the following command using your preferred package manager:

[//]: # 'installCommand'

```sh
npm install @tanstack/react-router
# or
pnpm add @tanstack/react-router
#or
yarn add @tanstack/react-router
# or
bun add @tanstack/react-router
# or
deno add npm:@tanstack/react-router
```

[//]: # 'installCommand'

Once installed, you can verify the installation by checking your `package.json` file for the dependency.

[//]: # 'packageJson'

```json
{
  "dependencies": {
    "@tanstack/react-router": "^x.x.x"
  }
}
```

[//]: # 'packageJson'
