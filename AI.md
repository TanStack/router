# AI.md

This file provides guidance to AI assistants when working with the TanStack Router codebase.

## Project Overview

TanStack Router is a type-safe router with built-in caching and URL state management for React and Solid applications. This monorepo contains two main products:

- **TanStack Router** - Core routing library with type-safe navigation, search params, and path params
- **TanStack Start** - Full-stack framework built on top of TanStack Router

## Repository Structure

### Core Packages

**Router Core:**

- `router-core/` - Framework-agnostic core router logic
- `react-router/` - React bindings and components
- `solid-router/` - Solid bindings and components
- `history/` - Browser history management

**Tooling:**

- `router-cli/` - CLI tools for code generation
- `router-generator/` - Route generation utilities
- `router-plugin/` - Universal bundler plugins (Vite, Webpack, ESBuild, Rspack)
- `router-vite-plugin/` - Vite-specific plugin wrapper
- `virtual-file-routes/` - Virtual file routing system

**Developer Experience:**

- `router-devtools/` - Router development tools
- `router-devtools-core/` - Core devtools functionality
- `react-router-devtools/` - React-specific devtools
- `solid-router-devtools/` - Solid-specific devtools
- `eslint-plugin-router/` - ESLint rules for router

**Adapters:**

- `zod-adapter/` - Zod validation adapter
- `valibot-adapter/` - Valibot validation adapter
- `arktype-adapter/` - ArkType validation adapter

**Start Framework:**

- `start/` - Core start framework
- `react-start/` - React Start framework
- `solid-start/` - Solid Start framework
- `start-*` packages - Various start framework utilities

### Documentation

Documentation is organized in `docs/`:

- `docs/router/` - Router-specific documentation
- `docs/start/` - Start framework documentation
- Each has `framework/react/` and `framework/solid/` subdirectories

### Examples

Extensive examples in `examples/`:

- `examples/react/` - React router examples
- `examples/solid/` - Solid router examples
- Examples range from basic usage to complex applications

### Testing

- `e2e/` - End-to-end tests organized by framework
- Individual packages have `tests/` directories
- Uses Playwright for e2e testing

## Essential Commands

### Development

```bash
# Install dependencies
pnpm install

# Build all packages (affected only)
pnpm build

# Build all packages (force all)
pnpm build:all

# Development mode with watch
pnpm dev

# Run all tests
pnpm test

# Run tests in CI mode
pnpm test:ci
```

### Testing

```bash
# Run unit tests
pnpm test:unit

# Run e2e tests
pnpm test:e2e

# Run type checking
pnpm test:types

# Run linting
pnpm test:eslint

# Run formatting check
pnpm test:format

# Fix formatting
pnpm prettier:write
```

### Targeted Testing with Nx

```bash
# Target specific package
npx nx run @tanstack/react-router:test:unit
npx nx run @tanstack/router-core:test:types
npx nx run @tanstack/history:test:eslint

# Target multiple packages
npx nx run-many --target=test:eslint --projects=@tanstack/history,@tanstack/router-core

# Run affected tests only (compares to main branch)
npx nx affected --target=test:unit

# Exclude certain patterns
npx nx run-many --target=test:unit --exclude="examples/**,e2e/**"

# List all available projects
npx nx show projects
```

### Granular Vitest Testing

For even more precise test targeting within packages:

```bash
# Navigate to package directory first
cd packages/react-router

# Run specific test files
npx vitest run tests/link.test.tsx
npx vitest run tests/ClientOnly.test.tsx tests/Scripts.test.tsx

# Run tests by name pattern
npx vitest run tests/ClientOnly.test.tsx -t "should render fallback"
npx vitest run -t "navigation"  # Run all tests with "navigation" in name

# Exclude test patterns
npx vitest run --exclude="**/*link*" tests/

# List available tests
npx vitest list tests/link.test.tsx
npx vitest list  # List all tests in package

# Through nx (passes args to vitest)
npx nx run @tanstack/react-router:test:unit -- tests/ClientOnly.test.tsx
npx nx run @tanstack/react-router:test:unit -- tests/link.test.tsx tests/Scripts.test.tsx
```

### Example Development

```bash
# Navigate to an example
cd examples/react/basic

# Run the example
pnpm dev
```

## Development Workflow

1. **Setup**: `pnpm install` and `pnpm exec playwright install`
2. **Build**: `pnpm build:all` or `pnpm dev` for watch mode
3. **Test**: Make changes and run relevant tests (use nx for targeted testing)
4. **Examples**: Navigate to examples and run `pnpm dev` to test changes

### Nx-Powered Development

This repository uses Nx for efficient task execution:

- **Caching**: Nx caches task results - repeated commands are faster
- **Affected**: Only runs tasks for changed code (`nx affected`)
- **Targeting**: Run tasks for specific packages or combinations
- **Parallel Execution**: Multiple tasks run in parallel automatically
- **Dependency Management**: Nx handles build order and dependencies

## Code Organization

### Monorepo Structure

This is a pnpm workspace with packages organized by functionality:

- Core packages provide the fundamental router logic
- Framework packages provide React/Solid bindings
- Tool packages provide development utilities
- Start packages provide full-stack framework capabilities

### Key Patterns

- **Type Safety**: Extensive use of TypeScript for type-safe routing
- **Framework Agnostic**: Core logic separated from framework bindings
- **Plugin Architecture**: Universal bundler plugins using unplugin
- **File-based Routing**: Support for both code-based and file-based routing
- **Search Params**: First-class support for type-safe search parameters

## Documentation Guidelines

- **Internal Links**: Always write relative to `docs/` folder (e.g., `./guide/data-loading`)
- **Examples**: Each major feature should have corresponding examples
- **Type Safety**: Document TypeScript patterns and type inference
- **Framework Specific**: Separate docs for React and Solid when needed

## Critical Quality Checks

**During prompt-driven development, always run unit and type tests to ensure validity. If either of these fail, do not stop or proceed (unless you have repeatedly failed and need human intervention).**

**You can run these (or the ones you are working on) after each big change:**

```bash
pnpm test:eslint    # Linting
pnpm test:types     # TypeScript compilation
pnpm test:unit      # Unit tests
pnpm test:build     # Build verification
```

**For comprehensive testing:**

```bash
pnpm test:ci        # Full CI test suite
pnpm test:e2e       # End-to-end tests
```

**For targeted testing (recommended for efficiency):**

```bash
# Test only affected packages
npx nx affected --target=test:unit
npx nx affected --target=test:types
npx nx affected --target=test:eslint

# Test specific packages you're working on
npx nx run @tanstack/react-router:test:unit
npx nx run @tanstack/router-core:test:types

# Test specific files/functionality you're working on
cd packages/react-router
npx vitest run tests/link.test.tsx -t "preloading"
npx vitest run tests/useNavigate.test.tsx tests/useParams.test.tsx
```

**Pro Tips:**

- Use `npx vitest list` to explore available tests before running
- Use `-t "pattern"` to focus on specific functionality during development
- Use `--exclude` patterns to skip unrelated tests
- Combine nx package targeting with vitest file targeting for maximum precision

## Package Dependencies

The monorepo uses workspace dependencies extensively:

- Core packages are dependencies of framework packages
- Framework packages are dependencies of start packages
- All packages use workspace protocol (`workspace:*`)

## Environment Setup

- **Node.js**: Required for development
- **pnpm**: Package manager (required for workspace features)
- **Playwright**: Required for e2e tests (`pnpm exec playwright install`)

## Common Tasks

### Adding New Routes

- Use file-based routing in `src/routes/` directories
- Or use code-based routing with route definitions
- Run route generation with CLI tools

### Testing Changes

- Build packages: `pnpm build` or `pnpm dev`
- Run example apps to test functionality
- Use devtools for debugging router state

**Available Test Targets per Package:**

- `test:unit` - Unit tests with Vitest
- `test:types` - TypeScript compilation across multiple TS versions
- `test:eslint` - Linting with ESLint
- `test:build` - Build verification (publint + attw)
- `test:perf` - Performance benchmarks
- `build` - Package building

**Granular Test Targeting Strategies:**

1. **Package Level**: Use nx to target specific packages
2. **File Level**: Use vitest directly to target specific test files
3. **Test Level**: Use vitest `-t` flag to target specific test names
4. **Pattern Level**: Use vitest exclude patterns to skip certain tests

Example workflow:

```bash
# 1. Test specific package
npx nx run @tanstack/react-router:test:unit

# 2. Test specific files within package
cd packages/react-router && npx vitest run tests/link.test.tsx

# 3. Test specific functionality
npx vitest run tests/link.test.tsx -t "preloading"
```

### Documentation Updates

- Update relevant docs in `docs/` directory
- Ensure examples reflect documentation
- Test documentation links and references

## Framework-Specific Notes

### React

- Uses React Router components and hooks
- Supports React Server Components (RSC)
- Examples include React Query integration

### Solid

- Uses Solid Router components and primitives
- Supports Solid Start for full-stack applications
- Examples include Solid Query integration

## References

- Main Documentation: https://tanstack.com/router
- GitHub Repository: https://github.com/TanStack/router
- Discord Community: https://discord.com/invite/WrRKjPJ
