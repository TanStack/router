# Production Configuration

Optimizing TanStack Start for production.

## Build Optimization

```ts
// app.config.ts
export default defineConfig({
  vite: {
    build: {
      minify: 'esbuild',
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['@tanstack/react-router'],
          },
        },
      },
    },
  },
})
```

## Compression

```ts
// app.config.ts
export default defineConfig({
  server: {
    compressPublicAssets: true,
    // Or configure compression
    compressPublicAssets: {
      gzip: true,
      brotli: true,
    },
  },
})
```

## Asset Caching

```ts
export default defineConfig({
  vite: {
    build: {
      assetsDir: 'assets',
      // Content-hash for cache busting
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'chunks/[name]-[hash].js',
          entryFileNames: '[name]-[hash].js',
        },
      },
    },
  },
})
```

## Production Environment

```ts
// app.config.ts
export default defineConfig({
  vite: {
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __DEV__: false,
    },
  },
})
```

## Error Handling

```tsx
// Global error boundary in root
export const Route = createRootRoute({
  errorComponent: ({ error }) => {
    // Log to monitoring in production
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error)
    }

    return <ErrorPage />
  },
})
```

## Health Checks

```tsx
// routes/api/health.ts
export const APIRoute = createAPIFileRoute('/api/health')({
  GET: async () => {
    const dbHealthy = await checkDatabase()

    return json(
      {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
      },
      {
        status: dbHealthy ? 200 : 503,
      },
    )
  },
})
```
