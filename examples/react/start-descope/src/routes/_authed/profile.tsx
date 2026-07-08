import { ClientOnly, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { UserProfile, useUser } from '@descope/react-sdk'

export const Route = createFileRoute('/_authed/profile')({
  component: ProfileComp,
})

function ProfileComp() {
  const router = useRouter()
  // `context.user` comes from the server-validated session (SSR-safe).
  const { user: sessionUser } = Route.useRouteContext()
  // `useUser()` fetches the full user profile on the client.
  const { user, isUserLoading } = useUser()
  // The widget's web component loads asynchronously; `onReady` fires once it
  // has rendered, so we show a skeleton until then.
  const [widgetReady, setWidgetReady] = useState(false)

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6 py-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Profile
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Manage your account with the Descope user profile widget, or inspect
          the raw session below.
        </p>
      </header>

      {/*
       * The `UserProfile` widget is a self-service account page (name, avatar,
       * passkeys, MFA, ...) rendered by Descope. Every project ships a default
       * widget with the id `user-profile-widget`. Like the login flow it is a
       * web component, so it only renders on the client.
       */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-4">
        <ClientOnly fallback={<WidgetSkeleton />}>
          {!widgetReady && <WidgetSkeleton />}
          <div className={widgetReady ? undefined : 'hidden'}>
            <UserProfile
              widgetId="user-profile-widget"
              theme="dark"
              onReady={() => setWidgetReady(true)}
              onLogout={() => router.navigate({ to: '/logout' })}
            />
          </div>
        </ClientOnly>
      </section>

      <section className="space-y-4">
        <details className="rounded-2xl border border-gray-800 bg-gray-900/50">
          <summary className="cursor-pointer select-none p-4 font-semibold text-white">
            Server session{' '}
            <span className="font-normal text-gray-400">
              — validated during SSR
            </span>
          </summary>
          <pre className="mx-4 mb-4 overflow-x-auto rounded-lg bg-gray-950 p-3 text-sm text-gray-300">
            {JSON.stringify(sessionUser, null, 2)}
          </pre>
        </details>

        <details className="rounded-2xl border border-gray-800 bg-gray-900/50">
          <summary className="cursor-pointer select-none p-4 font-semibold text-white">
            Client user{' '}
            <span className="font-normal text-gray-400">
              — from <code>useUser()</code>
            </span>
          </summary>
          {isUserLoading ? (
            <p className="px-4 pb-4 text-sm text-gray-500">Loading…</p>
          ) : (
            <pre className="mx-4 mb-4 overflow-x-auto rounded-lg bg-gray-950 p-3 text-sm text-gray-300">
              {JSON.stringify(user, null, 2)}
            </pre>
          )}
        </details>
      </section>
    </div>
  )
}

function WidgetSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-10 w-10 rounded-full bg-gray-800" />
      <div className="h-4 w-1/3 rounded bg-gray-800" />
      <div className="h-4 w-1/2 rounded bg-gray-800" />
    </div>
  )
}
