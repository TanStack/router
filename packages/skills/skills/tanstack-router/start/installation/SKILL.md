---
name: start-installation
description: |
  Installation and project setup for TanStack Start.
  Covers quick start, project structure, and deployment configuration.
---

# Installation

TanStack Start setup and project configuration.

## Common Patterns

### Pattern 1: Create New Project (Recommended)

```bash
# Create new project with CLI
npm create @tanstack/start@latest

# Or with pnpm
pnpm create @tanstack/start@latest

# Or with yarn
yarn create @tanstack/start@latest
```

### Pattern 2: Manual Setup - Core Dependencies

```bash
# Required packages
npm install @tanstack/react-router @tanstack/react-start

# Dev dependencies
npm install -D @tanstack/router-plugin vite @vitejs/plugin-react typescript
```

### Pattern 3: Minimal vite.config.ts

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tanstackStart(), react()],
})
```

### Pattern 4: Project Structure

```
project/
├── app/
│   ├── routes/
│   │   ├── __root.tsx      # Root layout
│   │   └── index.tsx       # Home page (/)
│   ├── client.tsx          # Client entry point
│   ├── router.tsx          # Router configuration
│   ├── ssr.tsx             # SSR entry point
│   └── routeTree.gen.ts    # Auto-generated
├── vite.config.ts
├── package.json
└── tsconfig.json
```

### Pattern 5: Development Commands

```bash
npm run dev     # Start development server (default: http://localhost:3000)
npm run build   # Build for production
npm run start   # Start production server
```

### Pattern 6: Basic tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["app/**/*", "vite.config.ts"]
}
```

## API Quick Reference

```bash
# CLI commands
npm create @tanstack/start@latest  # Scaffold new project

# Package scripts
npm run dev    # Start dev server with HMR
npm run build  # Build for production
npm run start  # Run production build

# Core packages
@tanstack/react-router   # Router core
@tanstack/react-start    # Start framework
@tanstack/router-plugin  # Vite plugin for route generation
```

## Detailed References

| Reference                     | When to Use                                |
| ----------------------------- | ------------------------------------------ |
| `references/quick-start.md`   | Creating a new Start project               |
| `references/project-setup.md` | Manual project configuration and structure |
| `references/vite-config.md`   | Configuring vite.config.ts for Start       |
| `references/deployment.md`    | Deploying to various hosting providers     |
