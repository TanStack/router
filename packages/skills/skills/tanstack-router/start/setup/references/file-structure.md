# File Structure

TanStack Start directory organization.

## Standard Structure

```
my-app/
├── app/
│   ├── routes/               # File-based routes
│   │   ├── __root.tsx        # Root layout
│   │   ├── index.tsx         # Home page (/)
│   │   ├── about.tsx         # /about
│   │   ├── posts/
│   │   │   ├── index.tsx     # /posts
│   │   │   └── $postId.tsx   # /posts/:postId
│   │   └── api/              # API routes
│   │       └── health.ts     # /api/health
│   │
│   ├── components/           # Shared components
│   ├── lib/                  # Utilities, helpers
│   ├── styles/               # CSS files
│   │
│   ├── client.tsx            # Client entry point
│   ├── router.tsx            # Router configuration
│   ├── ssr.tsx               # Server entry point
│   └── routeTree.gen.ts      # Generated (don't edit)
│
├── public/                   # Static assets
│   ├── favicon.ico
│   └── images/
│
├── app.config.ts             # Start configuration
├── package.json
└── tsconfig.json
```

## Route File Conventions

| File                     | Route           |
| ------------------------ | --------------- |
| `routes/__root.tsx`      | Root layout     |
| `routes/index.tsx`       | `/`             |
| `routes/about.tsx`       | `/about`        |
| `routes/posts/index.tsx` | `/posts`        |
| `routes/posts/$id.tsx`   | `/posts/:id`    |
| `routes/_layout.tsx`     | Pathless layout |
| `routes/api/*.ts`        | API routes      |

## Organizing Large Apps

```
app/
├── routes/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── server/        # Server functions
│   └── posts/
│       ├── components/
│       ├── hooks/
│       └── server/
├── shared/
│   ├── components/
│   ├── hooks/
│   └── utils/
```

## Path Aliases

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./app/*"],
      "@features/*": ["./app/features/*"]
    }
  }
}
```
