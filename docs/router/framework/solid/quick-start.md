---
title: Quick Start
---

To quickly scaffold a new project with TanStack Router, you can use the `create-tsrouter-app` command-line tool. This tool sets up a new Solid application with TanStack Router pre-configured, allowing you to get started quickly.

> [!TIP] For full details on available options and templates, visit the [`create-tsrouter-app` documentation](https://github.com/TanStack/create-tsrouter-app/tree/main/cli/create-tsrouter-app).

To create a new project, run the following command in your terminal:

```sh
npx create-tsrouter-app@latest --framework solid
```

The CLI will guide you through a short series of prompts to customize your setup, including options for:

- File-based or code-based route configuration
- TypeScript support
- Tailwind CSS integration
- Toolchain setup
- Git initialization

Once complete, a new Solid project will be generated with TanStack Router installed and ready to use. All dependencies are automatically installed, so you can jump straight into development:

```sh
cd your-project-name
npm run dev
```

## Routing Options

TanStack Router supports both file-based and code-based route configurations, allowing you to choose the approach that best fits your workflow.

### File-Based Route Generation

The file-based approach is the recommended option for most projects. It automatically creates routes based on your file structure, giving you the best mix of performance, simplicity, and developer experience.

To create a new project using file-based route generation, run the following command:

```sh
npx create-tsrouter-app@latest my-app --template file-router --framework solid
```

This command sets up a new directory called `my-app` with everything configured. Once setup completes, you can then start your development server and begin building your application:

```sh
cd my-app
npm run dev
```

### Using Code-Based Route Configuration

If you prefer to define routes programmatically, you can use the code-based route configuration. This approach gives you full control over routing logic while maintaining the same project scaffolding workflow.

```sh
npx create-tsrouter-app@latest my-app --franework solid
```

Similar to the file-based setup, this command creates a new directory called `my-app` with TanStack Router configured for code-based routing. After setup, navigate to your project directory and start the development server:

```sh
cd my-app
npm run dev
```

With either approach, you can now start building your Solid application with TanStack Router!
