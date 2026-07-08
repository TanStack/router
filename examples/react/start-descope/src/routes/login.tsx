import {
  ClientOnly,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
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

  return (
    <div className="mx-auto max-w-md p-6 py-16">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-white">
          Sign in
        </h1>
        {/*
         * The Descope flow renders as a web component that requires the
         * browser, so `ClientOnly` keeps it out of the SSR pass.
         */}
        <ClientOnly
          fallback={
            <p className="text-center text-sm text-gray-500">Loading…</p>
          }
        >
          <Descope
            flowId="sign-up-or-in"
            theme="dark"
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
        </ClientOnly>
      </div>
    </div>
  )
}
