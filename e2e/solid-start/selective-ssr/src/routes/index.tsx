import { Link, createFileRoute, linkOptions } from '@tanstack/solid-router'

export const Route = createFileRoute('/')({
  component: Home,
})

type TestSearchValue = {
  ssr?: boolean | 'data-only'
  expected: {
    data: 'server' | 'client'
    render: 'server-and-client' | 'client-only'
  }
}

type TestSearch = {
  root: TestSearchValue
  posts: TestSearchValue
  postId: TestSearchValue
}

const createTestLink = (search: TestSearch) =>
  linkOptions({
    to: '/posts/$postId',
    params: { postId: '1' },
    search,
  })

const testCases = [
  {
    link: createTestLink({
      root: {
        ssr: undefined,
        expected: { data: 'server', render: 'server-and-client' },
      },
      posts: {
        ssr: undefined,

        expected: { data: 'server', render: 'server-and-client' },
      },
      postId: {
        ssr: undefined,

        expected: { data: 'server', render: 'server-and-client' },
      },
    }),
  },
  {
    link: createTestLink({
      root: {
        ssr: false,
        expected: { data: 'client', render: 'client-only' },
      },
      posts: {
        ssr: undefined,

        expected: { data: 'client', render: 'client-only' },
      },
      postId: {
        ssr: undefined,

        expected: { data: 'client', render: 'client-only' },
      },
    }),
  },
  {
    link: createTestLink({
      root: {
        ssr: false,
        expected: { data: 'client', render: 'client-only' },
      },
      posts: {
        ssr: false,
        expected: { data: 'client', render: 'client-only' },
      },
      postId: {
        ssr: true,
        expected: { data: 'client', render: 'client-only' },
      },
    }),
  },
  {
    link: createTestLink({
      root: {
        ssr: true,
        expected: { data: 'server', render: 'server-and-client' },
      },
      posts: {
        ssr: false,
        expected: { data: 'client', render: 'client-only' },
      },
      postId: {
        ssr: undefined,

        expected: { data: 'client', render: 'client-only' },
      },
    }),
  },
  {
    link: createTestLink({
      root: {
        ssr: true,
        expected: { data: 'server', render: 'server-and-client' },
      },
      posts: {
        ssr: 'data-only',
        expected: { data: 'server', render: 'client-only' },
      },
      postId: {
        ssr: undefined,

        expected: { data: 'server', render: 'client-only' },
      },
    }),
  },
  {
    link: createTestLink({
      root: {
        ssr: 'data-only',
        expected: { data: 'server', render: 'client-only' },
      },
      posts: {
        ssr: true,
        expected: { data: 'server', render: 'client-only' },
      },
      postId: {
        ssr: undefined,

        expected: { data: 'server', render: 'client-only' },
      },
    }),
  },
  {
    link: createTestLink({
      root: {
        ssr: true,
        expected: { data: 'server', render: 'server-and-client' },
      },
      posts: {
        ssr: true,
        expected: { data: 'server', render: 'server-and-client' },
      },
      postId: {
        ssr: false,
        expected: { data: 'client', render: 'client-only' },
      },
    }),
  },
]

function Home() {
  const links = testCases.map((t, index) => {
    const key = `testcase-${index}-link`

    return (
      <div>
        <Link
          data-testid={key}
          to={t.link.to}
          params={t.link.params}
          search={t.link.search}
          reloadDocument={true}
        >
          root: {JSON.stringify(t.link.search.root.ssr ?? 'undefined')} posts:{' '}
          {JSON.stringify(t.link.search.posts.ssr ?? 'undefined')} $postId:{' '}
          {JSON.stringify(t.link.search.postId.ssr ?? 'undefined')}
        </Link>
        <br />
        <br />
      </div>
    )
  })

  return (
    <>
      <div>
        test count: <b data-testid="test-count">{links.length}</b>
      </div>
      <div>{links}</div>
    </>
  )
}
