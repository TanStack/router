# @tanstack/llm-docs

LLM-optimized documentation for TanStack Router and TanStack Start.

This package contains a stripped-down, condensed version of the TanStack Router and Start documentation, optimized for consumption by Large Language Models (LLMs) and AI coding assistants.

## Installation

This package is automatically included as a dependency of:

- `@tanstack/react-router`
- `@tanstack/react-start`
- `@tanstack/solid-router`
- `@tanstack/solid-start`
- `@tanstack/vue-router`
- `@tanstack/vue-start`
- `@tanstack/router-core`

You can also install it directly:

```bash
npm install @tanstack/llm-docs
```

## Usage

### For AI/LLM Tools

The `AGENT.md` file serves as the entry point and routing index:

```javascript
import agent from '@tanstack/llm-docs'
// or
import agent from '@tanstack/llm-docs/agent'
```

### Importing Specific Docs

```javascript
// Router docs
import navigation from '@tanstack/llm-docs/router/guide/navigation.md'
import dataLoading from '@tanstack/llm-docs/router/guide/data-loading.md'
import searchParams from '@tanstack/llm-docs/router/guide/search-params.md'

// Start docs
import serverFunctions from '@tanstack/llm-docs/start/guide/server-functions.md'
import ssr from '@tanstack/llm-docs/start/guide/ssr.md'
```

## What's Included

### Router Docs (`/router/`)

- **API Reference** - Component and hook documentation
- **Guides** - Navigation, data loading, search params, authentication, etc.
- **Routing** - File-based and code-based routing patterns
- **How-To** - Practical recipes and patterns

### Start Docs (`/start/`)

- **Guides** - Server functions, SSR, deployment, middleware
- **Tutorial** - Step-by-step learning path

## Optimizations

This package applies several transformations to reduce token usage:

1. **Frontmatter Removal** - YAML frontmatter stripped, title preserved as H1
2. **Code Deduplication** - Similar code examples condensed (keeps first per pattern)
3. **Interface Condensation** - Full TypeScript interfaces replaced with summaries
4. **Note Deduplication** - Repeated warnings/tips removed
5. **Whitespace Cleanup** - Excessive blank lines removed

Average reduction: ~9% overall, with repetitive guide files seeing 50-60% reduction.

## Regenerating Docs

The docs are regenerated from source during the build process:

```bash
# From the package directory
npm run build

# Or via nx from repo root
npx nx run @tanstack/llm-docs:build
```

The build is automatically triggered when docs change (configured via nx inputs).

## License

MIT
