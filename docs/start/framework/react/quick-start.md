---
id: quick-start
title: Quick Start
next_steps: {}
---

To quickly scaffold a new React project with TanStack Start, run the following command using your package manager of choice:

```bash
npm create @tanstack/start@latest
#or
pnpm create @tanstack/start@latest
```

On installation, you'll be prompted with a series of questions to customize your project, from the name of your project to the add-ons you'd like to include.

The options you'll be prompted for include:

- **Project name**: The name of your project. This will also be the name of the directory created for your project.
- **Tailwind CSS**: Whether you'd like to include Tailwind CSS in your project.
- **Toolchain options**: You can choose betwee Biome, ESLint, or none for linting and formatting.
- **Hosting providers**: Options include Cloudflare, Netlify, and Nitro. You can also choose none if you don't want any hosting configuration.
- **Various add-ons**: Integrate existing Tanstack libraries like [DB](https://tanstack.com/db/latest), [Query](https://tanstack.com/query/latest), and [Form](https://tanstack.com/form/latest), as well as range of other third-party tools and libraries.

Once you've answered the prompts, your project will be created. Since the cli scaffolds and installs dependencies, this can take a few minutes. Once it's done, navigate to your new project directory and start the development server with the following commands:

```bash
cd your-project-name
npm dev
```

## Using Examples

While the cli offers a quick way to scaffold a new project with the option to include various add-ons, you can also start with one of the many examples we've created to help you get started with common use-cases.

For the [Basic](https://github.com/TanStack/router/tree/main/examples/react/start-basic) example, you can run the following commands to clone it and get started:

```bash
npx gitpick TanStack/router/tree/main/examples/react/start-basic start-basic
cd start-basic
npm install
npm run dev
```

In addition to the Basic example, we've created a variety of other examples to get you started with different add-ons and use-cases. Simply replace `start-basic` in the commands above with the slug of the example you'd like to use from the list below to clone and get started:

- [Basic + Auth](https://github.com/TanStack/router/tree/main/examples/react/start-basic-auth) (start-basic-auth)
- [Counter](https://github.com/TanStack/router/tree/main/examples/react/start-counter) (start-counter)
- [Basic + React Query](https://github.com/TanStack/router/tree/main/examples/react/start-basic-react-query) (start-basic-react-query)
- [Clerk Auth](https://github.com/TanStack/router/tree/main/examples/react/start-clerk-basic) (start-clerk-basic)
- [Convex + Trellaux](https://github.com/TanStack/router/tree/main/examples/react/start-convex-trellaux) (start-convex-trellaux)
- [Supabase](https://github.com/TanStack/router/tree/main/examples/react/start-supabase-basic) (start-supabase-basic)
- [Trellaux](https://github.com/TanStack/router/tree/main/examples/react/start-trellaux) (start-trellaux)
- [WorkOS](https://github.com/TanStack/router/tree/main/examples/react/start-workos) (start-workos)
- [Material UI](https://github.com/TanStack/router/tree/main/examples/react/start-material-ui) (start-material-ui)

> [!NOTE]
> While not specific to Start, TanStack Router offers a variety of other examples that may help you understand more about how TanStack Router works. See these examples in [Router's documentation](https://tanstack.com/router/latest/docs/examples/overview).

Each of the above examples includes an embedded Stackblitz preview to help you find the one that works best for your use-case. To see these, simply select the example you wish to preview from the "Examples" section in the sidebar.
