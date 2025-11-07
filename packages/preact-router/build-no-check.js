import { build } from 'vite'
build({
  mode: 'production',
  build: { emptyOutDir: true },
  logLevel: 'warn',
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
