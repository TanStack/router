/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createRoot, run } from '@remix-run/ui'
import { StartClient, hydrateStart } from '@tanstack/remix-start/client'

const router = await hydrateStart()

// Initialize the Remix UI runtime so `clientEntry()` islands hydrate.
// `loadModule(url, exportName)` must return the named export directly,
// not the module namespace — the runtime expects a function.
run({
  loadModule: async (url: string, exportName: string) => {
    const mod = await import(/* @vite-ignore */ url)
    return mod[exportName]
  },
})

// Mount the router's render tree against the existing SSR'd body. The
// document shell is server-only (see `<StartServer>`); on the client
// we hydrate against `document.body` since the route render tree is
// scoped to body content.
const root = createRoot(document.body)
root.render(<StartClient router={router} />)
