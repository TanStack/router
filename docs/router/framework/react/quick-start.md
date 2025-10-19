---
id: quick-start
title: Quick Start
---

TanStack Router can be quickly added to any existing React project or used to scaffold a new one.

## TanStack Router Installation

### Requirements

Before installing TanStack router, please ensure your project meets the following requirements:

[//]: # 'Requirements'

- `react` v18 or later with `createRoot` support.
- `react-dom` v18 or later.

[//]: # 'Requirements'

> [!NOTE] Using TypeScript (`v5.3.x or higher`) is recommended for the best development experience, though not strictly required. We aim to support the last 5 minor versions of TypeScript, but using the latest version will help avoid potential issues.

TanStack Router is currently only compatible with React (with ReactDOM) and Solid. If you're interested in contributing to support other frameworks, such as React Native, Angular, or Vue, please reach out to us on [Discord](https://tlinz.com/discord).

### Download and Install

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

## New Project Setup

To quickly scaffold a new project with TanStack Router, you can use the `create-tsrouter-app` command-line tool. This tool sets up a new React application with TanStack Router pre-configured, allowing you to get started quickly.

> [!TIP] For full details on available options and templates, visit the [`create-tsrouter-app` documentation](https://github.com/TanStack/create-tsrouter-app/tree/main/cli/create-tsrouter-app).

To create a new project, run the following command in your terminal:

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

Once complete, a new React project will be generated with TanStack Router installed and ready to use. All dependencies are automatically installed, so you can jump straight into development:

```sh
cd your-project-name
npm run dev
```

### Routing Options

TanStack Router supports both file-based and code-based route configurations, allowing you to choose the approach that best fits your workflow.

#### File-Based Route Generation

The file-based approach is the recommended option for most projects. It automatically creates routes based on your file structure, giving you the best mix of performance, simplicity, and developer experience.

To create a new project using file-based route generation, run the following command:

[//]: # 'createAppCommandFileBased'

```sh
npx create-tsrouter-app@latest my-app --template file-router
```

[//]: # 'createAppCommandFileBased'

This command sets up a new directory called `my-app` with everything configured. Once setup completes, you can then start your development server and begin building your application:

```sh
cd my-app
npm run dev
```

#### Code-Based Route Configuration

If you prefer to define routes programmatically, you can use the code-based route configuration. This approach gives you full control over routing logic while maintaining the same project scaffolding workflow.

[//]: # 'createAppCommandCodeBased'

```sh
npx create-tsrouter-app@latest my-app
```

[//]: # 'createAppCommandCodeBased'

Similar to the file-based setup, this command creates a new directory called `my-app` with TanStack Router configured for code-based routing. After setup, navigate to your project directory and start the development server:

```sh
cd my-app
npm run dev
```

With either approach, you can now start building your React application with TanStack Router!
