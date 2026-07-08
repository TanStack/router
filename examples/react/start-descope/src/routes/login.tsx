import {
  ClientOnly,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { Descope } from '@descope/react-sdk'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    // Already signed in — no need to show the login flow.
    if (context.user) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginComp,
})

function LoginComp() {
  const router = useRouter()
  // The flow's web component has to download and fetch its flow definition
  // before it renders anything. `onReady` fires once that's done — until then
  // we show a loader so the user never sees an empty box.
  const [ready, setReady] = useState(false)

  return (
    <div className="mx-auto max-w-md p-6 py-16">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-white">
          Sign in
        </h1>
        {/*
         * The Descope flow renders as a web component that requires the
         * browser, so `ClientOnly` keeps it out of the SSR pass. The loader
         * covers two phases: SSR + hydration (via the `fallback`), and the
         * web component's own load (until `onReady`). We keep the flow mounted
         * but hidden during that second phase so it can actually load.
         */}
        <ClientOnly fallback={<Loader />}>
          {!ready && <Loader />}
          <div className={ready ? undefined : 'hidden'}>
            <Descope
              flowId="sign-up-or-in"
              theme="dark"
              onReady={() => setReady(true)}
              onSuccess={async () => {
                // Re-run the root loader so the server picks up the new session
                // cookie, then send the user home.
                await router.invalidate()
                await router.navigate({ to: '/' })
              }}
              onError={(err) => {
                console.error('Descope flow error', err)
              }}
            />
          </div>
        </ClientOnly>
      </div>
    </div>
  )
}

function Loader() {
  return (
    <div className="flex justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-gray-300" />
    </div>
  )
}
