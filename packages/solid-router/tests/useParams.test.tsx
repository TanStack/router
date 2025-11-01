import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '../src'

test('useParams must return parsed result if applicable.', async () => {
  const posts = [
    {
      id: 1,
      title: 'First Post',
      category: 'one',
    },
    {
      id: 2,
      title: 'Second Post',
      category: 'two',
    },
  ]

  const mockedfn = vi.fn()
  const rootRoute = createRootRoute()

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    component: PostsComponent,
  })

  const postCategoryRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: 'category_{$category}',
    component: PostCategoryComponent,
    params: {
      parse: (params) => {
        return {
          ...params,
          category:
            params.category === 'first'
              ? 'one'
              : params.category === 'second'
                ? 'two'
                : params.category,
        }
      },
      stringify: (params) => {
        return {
          category:
            params.category === 'one'
              ? 'first'
              : params.category === 'two'
                ? 'second'
                : params.category,
        }
      },
    },
    loader: ({ params }) => ({
      posts:
        params.category === 'all'
          ? posts
          : posts.filter((post) => post.category === params.category),
    }),
  })

  const postRoute = createRoute({
    getParentRoute: () => postCategoryRoute,
    path: '$postId',
    params: {
      parse: (params) => {
        mockedfn()
        return {
          ...params,
          postId: params.postId === 'one' ? '1' : '2',
        }
      },
    },
    component: PostComponent,
    loader: ({ params }) => ({
      post: posts.find((post) => post.id === parseInt(params.postId)),
    }),
  })

  function PostsComponent() {
    return (
      <div>
        <h1 data-testid="posts-heading">Posts</h1>
        <Link
          data-testid="all-category-link"
          to={postCategoryRoute.fullPath}
          params={{ category: 'all' }}
        >
          All Categories
        </Link>
        <Link
          data-testid="first-category-link"
          to={postCategoryRoute.fullPath}
          params={{ category: 'first' }}
        >
          First Category
        </Link>
        <Outlet />
      </div>
    )
  }

  function PostCategoryComponent() {
    const data = postCategoryRoute.useLoaderData()

    return (
      <div>
        <h1 data-testid="post-category-heading">Post Categories</h1>
        {data().posts.map((post: (typeof posts)[number]) => {
          const id = post.id === 1 ? 'one' : 'two'
          return (
            <Link
              from={postCategoryRoute.fullPath}
              to="./$postId"
              params={{ postId: id }}
              data-testid={`post-${id}-link`}
            >
              {post.title}
            </Link>
          )
        })}
        <Outlet />
      </div>
    )
  }

  function PostComponent() {
    const params = useParams({ from: postRoute.fullPath })

    const data = postRoute.useLoaderData()

    return (
      <div>
        <h1 data-testid="post-heading">Post Route</h1>
        <div>
          Category_Param:{' '}
          <span data-testid="param_category_value">{params().category}</span>
        </div>
        <div>
          PostId_Param:{' '}
          <span data-testid="param_postId_value">{params().postId}</span>
        </div>
        <div>
          PostId: <span data-testid="post_id_value">{data().post.id}</span>
        </div>
        <div>
          Title: <span data-testid="post_title_value">{data().post.title}</span>
        </div>
        <div>
          Category:{' '}
          <span data-testid="post_category_value">{data().post.category}</span>
        </div>
      </div>
    )
  }

  window.history.replaceState({}, '', '/posts')

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      postsRoute.addChildren([postCategoryRoute.addChildren([postRoute])]),
    ]),
  })

  render(() => <RouterProvider router={router} />)

  await waitFor(() => router.load())

  expect(await screen.findByTestId('posts-heading')).toBeInTheDocument()

  const firstCategoryLink = await screen.findByTestId('first-category-link')

  expect(firstCategoryLink).toBeInTheDocument()

  mockedfn.mockClear()
  fireEvent.click(firstCategoryLink)

  await waitFor(() => expect(window.location.pathname).toBe('/posts/category_first'))
  const firstPostLink = await screen.findByTestId('post-one-link')
  expect(await screen.findByTestId('post-category-heading')).toBeInTheDocument()
  expect(mockedfn).toHaveBeenCalledTimes(1)

  mockedfn.mockClear()
  // Query element right before use and ensure it's connected to DOM
  // With stable contexts, old elements may be removed but cached by testing library
  await waitFor(async () => {
    const el = await screen.findByTestId('post-one-link')
    expect(el.isConnected).toBe(true)
  })
  fireEvent.click(await screen.findByTestId('post-one-link'))

  await waitFor(() => expect(window.location.pathname).toBe('/posts/category_first/one'))
  // Wait for navigation to complete and elements to be connected
  let paramCategoryValue = await screen.findByTestId('param_category_value')
  let paramPostIdValue = await screen.findByTestId('param_postId_value')
  let postCategory = await screen.findByTestId('post_category_value')
  let postTitleValue = await screen.findByTestId('post_title_value')
  let postIdValue = await screen.findByTestId('post_id_value')
  let renderedPost = {
    id: parseInt(postIdValue.textContent),
    title: postTitleValue.textContent,
    category: postCategory.textContent,
  }

  expect(window.location.pathname).toBe('/posts/category_first/one')
  expect(await screen.findByTestId('post-heading')).toBeInTheDocument()
  expect(renderedPost).toEqual(posts[0])
  expect(renderedPost.category).toBe('one')
  expect(paramCategoryValue.textContent).toBe('one')
  expect(paramPostIdValue.textContent).toBe('1')
  expect(mockedfn).toHaveBeenCalledTimes(2)
  expect(await screen.findByTestId('all-category-link')).toBeInTheDocument()

  mockedfn.mockClear()
  // Query element right before use and ensure it's connected to DOM
  await waitFor(async () => {
    const el = await screen.findByTestId('all-category-link')
    expect(el.isConnected).toBe(true)
  })
  fireEvent.click(await screen.findByTestId('all-category-link'))

  await waitFor(() => expect(window.location.pathname).toBe('/posts/category_all'))
  expect(await screen.findByTestId('post-category-heading')).toBeInTheDocument()
  expect(await screen.findByTestId('post-two-link')).toBeInTheDocument()
  expect(mockedfn).toHaveBeenCalledTimes(2)

  mockedfn.mockClear()
  // Query element right before use and ensure it's connected to DOM
  await waitFor(async () => {
    const el = await screen.findByTestId('post-two-link')
    expect(el.isConnected).toBe(true)
  })
  fireEvent.click(await screen.findByTestId('post-two-link'))

  await waitFor(() => expect(window.location.pathname).toBe('/posts/category_all/two'))
  paramCategoryValue = await screen.findByTestId('param_category_value')
  paramPostIdValue = await screen.findByTestId('param_postId_value')
  postCategory = await screen.findByTestId('post_category_value')
  postTitleValue = await screen.findByTestId('post_title_value')
  postIdValue = await screen.findByTestId('post_id_value')
  renderedPost = {
    id: parseInt(postIdValue.textContent),
    title: postTitleValue.textContent,
    category: postCategory.textContent,
  }

  expect(window.location.pathname).toBe('/posts/category_all/two')
  expect(await screen.findByTestId('post-heading')).toBeInTheDocument()
  expect(renderedPost).toEqual(posts[1])
  expect(renderedPost.category).toBe('two')
  expect(paramCategoryValue.textContent).toBe('all')
  expect(paramPostIdValue.textContent).toBe('2')
  // With stable contexts and waitFor pattern, params may be parsed an extra time
  expect(mockedfn).toHaveBeenCalledTimes(3)
})
