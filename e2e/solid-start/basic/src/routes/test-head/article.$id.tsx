import { createFileRoute, useRouter } from '@tanstack/solid-router'
import { Show } from 'solid-js'
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

export const Route = createFileRoute('/test-head/article/$id')({
  ssr: false, // isAuthed is ClientOnly
  loader: async ({ params }) => {
    const article = await fetchArticle(params.id)
    return article
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title ?? 'title n/a' }],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  const router = useRouter()
  const data = Route.useLoaderData()
  return (
    <Show when={data()} fallback={<NotAccessible />}>
      {(article) => (
        <div>
          <div>{article().content}</div>
          <button
            type="button"
            onClick={() => {
              fakeLogout()
              router.invalidate()
            }}
          >
            Log out
          </button>
        </div>
      )}
    </Show>
  )
}

function NotAccessible() {
  const router = useRouter()
  return (
    <div>
      <div>Article Not Accessible.</div>
      <button
        type="button"
        onClick={() => {
          fakeLogin()
          router.invalidate()
        }}
      >
        Log in
      </button>
    </div>
  )
}
