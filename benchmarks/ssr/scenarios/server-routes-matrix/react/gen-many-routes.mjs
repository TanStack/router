// Writes 200 static server-only routes so the matcher is measured on a tree
// of realistic size. Output is gitignored; runs before every build.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MANY_ROUTE_COUNT = 200 // keep in sync with ../hono.ts
const dir = fileURLToPath(new URL('./src/routes/api/many/', import.meta.url))

mkdirSync(dir, { recursive: true })
for (let n = 0; n < MANY_ROUTE_COUNT; n++) {
  writeFileSync(
    `${dir}r${n}.ts`,
    `import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/many/r${n}')({
  server: { handlers: { GET: () => Response.json({ n: ${n} }) } },
})
`,
  )
}
