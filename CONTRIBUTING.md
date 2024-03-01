# Contributing

- Clone the repo
  - `gh repo clone TanStack/router`
- Ensure `node` is installed
  - https://nodejs.org/en/
- Ensure `pnpm` is installed
  - https://pnpm.io/installation
  - Why? We use `pnpm` to manage workspace dependencies. It's easily the best monorepo/workspace experience available as of when this was written.
- Install dependencies
  - `pnpm install`
  - This installs dependencies for all of the packages in the monorepo, even examples!
  - Dependencies inside of the packages and examples are automatically linked together as local/dynamic dependencies.
- Run the build or dev watcher
  - `pnpm build:all` (build all packages) or
  - `pnpm build` (cached build with [nx affected](https://nx.dev/nx-api/nx/documents/affected)) or
  - `pnpm dev`
- Navigate to an example
  - `cd examples/react/basic`
- Run the example
  - `pnpm dev`
- Make changes to the code
  - If you ran `pnpm dev` the dev watcher will automatically rebuild the code that has changed
- Changes to the docs
  - Be sure that internal links are written always relative to `docs` folder.
    E.g. `./guide/data-loading`
