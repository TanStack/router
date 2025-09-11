import { expect, test } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
        return {
          ...params,
          id: params.postId === 'one' ? 1 : 2,
        }
      },
      stringify: (params) => {
        return {
          postId: params.id === 1 ? 'one' : 'two',
        }
      },
    },
    component: PostComponent,
    loader: ({ params }) => ({
      post: posts.find((post) => post.id === params.id),
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
        {data.posts.map((post: (typeof posts)[number]) => {
          const id = post.id === 1 ? 'one' : 'two'
          return (
            <Link
              key={id}
              from={postCategoryRoute.fullPath}
              to={`./${id}`}
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
          <span data-testid="param_category_value">{params.category}</span>
        </div>
        <div>
          PostId_Param:{' '}
          <span data-testid="param_postId_value">{params.postId}</span>
        </div>
        <div>
          Id_Param: <span data-testid="param_id_value">{params.id}</span>
        </div>
        <div>
          PostId: <span data-testid="post_id_value">{data.post.id}</span>
        </div>
        <div>
          Title: <span data-testid="post_title_value">{data.post.title}</span>
        </div>
        <div>
          Category:{' '}
          <span data-testid="post_category_value">{data.post.category}</span>
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

  render(<RouterProvider router={router} />)

  await act(() => router.load())

  expect(await screen.findByTestId('posts-heading')).toBeInTheDocument()

  const firstCategoryLink = await screen.findByTestId('first-category-link')

  expect(firstCategoryLink).toBeInTheDocument()

  await act(() => fireEvent.click(firstCategoryLink))

  expect(window.location.pathname).toBe('/posts/category_first')

  const postCategoryHeading = await screen.findByTestId('post-category-heading')
  const firstPostLink = await screen.findByTestId('post-one-link')

  expect(postCategoryHeading).toBeInTheDocument()

  fireEvent.click(firstPostLink)

  let postHeading = await screen.findByTestId('post-heading')
  let paramCategoryValue = await screen.findByTestId('param_category_value')
  let paramPostIdValue = await screen.findByTestId('param_postId_value')
  let paramIdValue = await screen.findByTestId('param_id_value')
  let postCategory = await screen.findByTestId('post_category_value')
  let postTitleValue = await screen.findByTestId('post_title_value')
  let postIdValue = await screen.findByTestId('post_id_value')

  expect(window.location.pathname).toBe('/posts/category_first/one')
  expect(postHeading).toBeInTheDocument()

  let renderedPost = {
    id: parseInt(postIdValue.textContent),
    title: postTitleValue.textContent,
    category: postCategory.textContent,
  }

  expect(renderedPost).toEqual(posts[0])
  expect(renderedPost.category).toBe('one')
  expect(paramCategoryValue.textContent).toBe('one')
  expect(paramPostIdValue.textContent).toBe('one')
  expect(paramIdValue.textContent).toBe('1')

  const allCategoryLink = await screen.findByTestId('all-category-link')

  expect(allCategoryLink).toBeInTheDocument()

  await act(() => fireEvent.click(allCategoryLink))

  expect(window.location.pathname).toBe('/posts/category_all')

  const secondPostLink = await screen.findByTestId('post-two-link')

  expect(postCategoryHeading).toBeInTheDocument()
  expect(secondPostLink).toBeInTheDocument()

  fireEvent.click(secondPostLink)

  postHeading = await screen.findByTestId('post-heading')
  paramCategoryValue = await screen.findByTestId('param_category_value')
  paramPostIdValue = await screen.findByTestId('param_postId_value')
  paramIdValue = await screen.findByTestId('param_id_value')
  postCategory = await screen.findByTestId('post_category_value')
  postTitleValue = await screen.findByTestId('post_title_value')
  postIdValue = await screen.findByTestId('post_id_value')

  expect(window.location.pathname).toBe('/posts/category_all/two')
  expect(postHeading).toBeInTheDocument()

  renderedPost = {
    id: parseInt(postIdValue.textContent),
    title: postTitleValue.textContent,
    category: postCategory.textContent,
  }

  expect(renderedPost).toEqual(posts[1])
  expect(renderedPost.category).toBe('two')
  expect(paramCategoryValue.textContent).toBe('all')
  expect(paramPostIdValue.textContent).toBe('two')
  expect(paramIdValue.textContent).toBe('2')
})
