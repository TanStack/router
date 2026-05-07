import { run } from '@remix-run/ui'

run({
  loadModule: async (url, exportName) => {
    const mod = await import(/* @vite-ignore */ url)
    return mod[exportName]
  },
})
