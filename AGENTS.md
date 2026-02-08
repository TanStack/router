# AGENTS.md

## Project overview

TanStack Router is a type-safe router with built-in caching and URL state management for React and Solid applications. This monorepo contains two main products:

- **TanStack Router** - Core routing library with type-safe navigation, search params, and path params
- **TanStack Start** - Full-stack framework built on top of TanStack Router

## Setup commands

- Install deps: `pnpm install`
- Setup e2e testing: `pnpm exec playwright install`
- Build packages: `pnpm build` (affected) or `pnpm build:all` (force all)
- Start dev server: `pnpm dev`
- Run tests: `pnpm test`

## Code style

- TypeScript strict mode with extensive type safety
- Framework-agnostic core logic separated from React/Solid bindings
- Type-safe routing with search params and path params
- Use workspace protocol for internal dependencies (`workspace:*`)

## Dev environment tips

- This is a pnpm workspace monorepo with packages organized by functionality
- Nx provides caching, affected testing, targeting, and parallel execution for efficiency
- Use `npx nx show projects` to list all available packages
- Target specific packages: `npx nx run @tanstack/react-router:test:unit`
- Target multiple packages: `npx nx run-many --target=test:eslint --projects=@tanstack/history,@tanstack/router-core`
- Run affected tests only: `npx nx affected --target=test:unit`
- Exclude patterns: `npx nx run-many --target=test:unit --exclude="examples/**,e2e/**"`
- Navigate to examples and run `pnpm dev` to test changes: `cd examples/react/basic && pnpm dev`
- **Granular Vitest testing within packages:**
  - Navigate first: `cd packages/react-router`
  - Specific files: `npx vitest run tests/link.test.tsx tests/Scripts.test.tsx`
  - Test patterns: `npx vitest run tests/ClientOnly.test.tsx -t "should render fallback"`
  - Name patterns: `npx vitest run -t "navigation"` (all tests with "navigation" in name)
  - Exclude patterns: `npx vitest run --exclude="**/*link*" tests/`
  - List tests: `npx vitest list tests/link.test.tsx` or `npx vitest list` (all)
  - Through nx: `npx nx run @tanstack/react-router:test:unit -- tests/ClientOnly.test.tsx`
- **Available test targets per package:** `test:unit`, `test:types`, `test:eslint`, `test:build`, `test:perf`, `build`
- **Testing strategy:** Package level (nx) → File level (vitest) → Test level (-t flag) → Pattern level (exclude)

## Testing instructions

- **Critical**: Always run unit and type tests during development - do not proceed if they fail
- **Test types:** `pnpm test:unit`, `pnpm test:types`, `pnpm test:eslint`, `pnpm test:e2e`, `pnpm test:build`
- **Full CI suite:** `pnpm test:ci`
- **Fix formatting:** `pnpm format`
- **Efficient targeted testing workflow:**
  1. **Affected only:** `npx nx affected --target=test:unit` (compares to main branch)
  2. **Specific packages:** `npx nx run @tanstack/react-router:test:unit`
  3. **Specific files:** `cd packages/react-router && npx vitest run tests/link.test.tsx`
  4. **Specific patterns:** `npx vitest run tests/link.test.tsx -t "preloading"`
- **Pro tips:**
  - Use `npx vitest list` to explore available tests before running
  - Use `-t "pattern"` to focus on specific functionality during development
  - Use `--exclude` patterns to skip unrelated tests
  - Combine nx package targeting with vitest file targeting for maximum precision
- **Example workflow:** `npx nx run @tanstack/react-router:test:unit` → `cd packages/react-router && npx vitest run tests/link.test.tsx` → `npx vitest run tests/link.test.tsx -t "preloading"`

## PR instructions

- Always run `pnpm test:eslint`, `pnpm test:types`, and `pnpm test:unit` before committing
- Test changes in relevant example apps: `cd examples/react/basic && pnpm dev`
- Update corresponding documentation in `docs/` directory when adding features
- Add or update tests for any code changes
- Use internal docs links relative to `docs/` folder (e.g., `./guide/data-loading`)

## Package structure

**Core packages:**

- `packages/router-core/` - Framework-agnostic core router logic
- `packages/react-router/`, `packages/solid-router/` - React/Solid bindings and components
- `packages/history/` - Browser history management

**Tooling:**

- `packages/router-cli/` - CLI tools for code generation
- `packages/router-generator/` - Route generation utilities
- `packages/router-plugin/` - Universal bundler plugins (Vite, Webpack, ESBuild, Rspack)
- `packages/virtual-file-routes/` - Virtual file routing system

**Developer experience:**

- `packages/router-devtools/`, `packages/*-router-devtools/` - Development tools
- `packages/eslint-plugin-router/` - ESLint rules for router

**Validation adapters:**

- `packages/zod-adapter/`, `packages/valibot-adapter/`, `packages/arktype-adapter/`

**Start framework:**

- `packages/*-start/`, `packages/start-*/` - Full-stack framework packages

**Examples & testing:**

- `examples/react/`, `examples/solid/` - Example applications (test changes here)
- `e2e/` - End-to-end tests (requires Playwright)
- `docs/router/`, `docs/start/` - Documentation with React/Solid subdirectories

**Dependencies:** Uses workspace protocol (`workspace:*`) - core → framework → start packages

## Common development tasks

**Adding new routes:**

- Use file-based routing in `src/routes/` directories
- Or use code-based routing with route definitions
- Run route generation with CLI tools

**Testing changes:**

- Build packages: `pnpm build` or `pnpm dev` (watch mode)
- Run example apps to test functionality
- Use devtools for debugging router state

**Documentation updates:**

- Update relevant docs in `docs/` directory
- Ensure examples reflect documentation changes
- Test documentation links and references
- Use relative links to `docs/` folder format

## Framework-specific notes

**React:**

- Uses React Router components and hooks
- Supports React Server Components (RSC)
- Examples include React Query integration
- Package: `@tanstack/react-router`

**Solid:**

- Uses Solid Router components and primitives
- Supports Solid Start for full-stack applications
- Examples include Solid Query integration
- Package: `@tanstack/solid-router`

## Environment requirements

- **Node.js** - Required for development
- **pnpm** - Package manager (required for workspace features)
- **Playwright** - Required for e2e tests (`pnpm exec playwright install`)

## Key architecture patterns

- **Type Safety**: Extensive TypeScript for type-safe routing
- **Framework Agnostic**: Core logic separated from framework bindings
- **Plugin Architecture**: Universal bundler plugins using unplugin
- **File-based Routing**: Support for both code-based and file-based routing
- **Search Params**: First-class support for type-safe search parameters

## Development workflow

1. **Setup**: `pnpm install` and `pnpm exec playwright install`
2. **Build**: `pnpm build:all` or `pnpm dev` for watch mode
3. **Test**: Make changes and run relevant tests (use nx for targeted testing)
4. **Examples**: Navigate to examples and run `pnpm dev` to test changes
5. **Quality**: Run `pnpm test:eslint`, `pnpm test:types`, `pnpm test:unit` before committing

## References

- **Documentation**: https://tanstack.com/router
- **GitHub**: https://github.com/TanStack/router
- **Discord Community**: https://discord.com/invite/WrRKjPJ
