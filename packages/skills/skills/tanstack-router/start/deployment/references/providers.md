# Hosting Providers

Platform-specific deployment configuration.

## Vercel

```ts
// app.config.ts
export default defineConfig({
  server: { preset: 'vercel' },
})
```

Deploy:

```bash
npm i -g vercel
vercel
```

## Netlify

```ts
// app.config.ts
export default defineConfig({
  server: { preset: 'netlify' },
})
```

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = ".output/public"
  functions = ".output/server"
```

## Cloudflare Pages

```ts
// app.config.ts
export default defineConfig({
  server: { preset: 'cloudflare-pages' },
})
```

```bash
npx wrangler pages deploy .output/public
```

## Node.js (Self-Hosted)

```ts
// app.config.ts
export default defineConfig({
  server: {
    preset: 'node',
    port: 3000,
  },
})
```

```bash
npm run build
node .output/server/index.mjs
```

## Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

## AWS Lambda

```ts
// app.config.ts
export default defineConfig({
  server: { preset: 'aws-lambda' },
})
```

## Environment Variables

Set per platform:

```bash
# Vercel
vercel env add DATABASE_URL

# Netlify
netlify env:set DATABASE_URL "value"

# Cloudflare
wrangler secret put DATABASE_URL
```
