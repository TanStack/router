# Project Setup

Initial setup for a TanStack Start project.

## Create New Project

```bash
npm create @tanstack/start@latest my-app
cd my-app
npm install
npm run dev
```

## Manual Setup

### Dependencies

```bash
npm install @tanstack/react-router @tanstack/start vinxi
npm install -D @tanstack/router-plugin
```

### package.json Scripts

```json
{
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start"
  }
}
```

### TypeScript Config

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "paths": {
      "~/*": ["./app/*"]
    }
  },
  "include": ["app/**/*", "app.config.ts"]
}
```

## Minimum Files Required

```
my-app/
├── app/
│   ├── routes/
│   │   ├── __root.tsx
│   │   └── index.tsx
│   ├── client.tsx
│   ├── router.tsx
│   └── ssr.tsx
├── app.config.ts
├── package.json
└── tsconfig.json
```

## Verify Setup

```bash
npm run dev
# Open http://localhost:3000
```
