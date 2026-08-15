import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({ bun: { port: 3000 } })
await start.dev()
