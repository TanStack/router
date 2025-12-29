import { createFileRoute, useRouter } from '@tanstack/solid-router'
import { createSignal, Show } from 'solid-js'
import { fakeLogin, fakeLogout, isAuthed } from '~/utils/fake-auth'

const fetchArticle = async (id: string) => {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return isAuthed()
    ? {
        title: `Article Title for ${id}`,
        content: `Article content for ${id}\n`.repeat(10),
      }
    : null
}

export const Route = createFileRoute('/article/$id')({
  ssr: false, // isAuthed is ClientOnly
  loader: async ({ params }) => {
    const article = await fetchArticle(params.id)
    return article
  },
  head: ({ loaderData }) => {
    const title = loaderData?.title ?? 'title n/a'
    console.log('[head] Setting title:', title)
    return {
      meta: [{ title }],
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()

  return (
    <>
      <AuthStatus />
      <Show when={data()} fallback={<div>Article Not Accessible.</div>}>
        {(article) => (
          <div>{article().content}</div>
        )}
      </Show>
    </>
  )
}

function AuthStatus() {
  const router = useRouter()

  const [auth, setAuth] = createSignal(isAuthed())

  return (
    <Show
      when={auth()}
      fallback={
        <div class="bg-red-200">
          <div class="text-red-600">Not authenticated</div>
          <button
            type="button"
            class="bg-green-200"
            onClick={() => {
              fakeLogin()
              setAuth(true)
              router.invalidate()
            }}
          >
            Log in
          </button>
        </div>
      }
    >
      <div class="bg-green-200">
        <div class="text-green-600">You're authenticated!</div>
        <button
          type="button"
          class="bg-red-200"
          onClick={() => {
            fakeLogout()
            setAuth(false)
            router.invalidate()
          }}
        >
          Log out
        </button>
      </div>
    </Show>
  )
}
