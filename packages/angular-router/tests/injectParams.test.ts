import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  injectParams,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  vi.clearAllMocks()
})

const POST_CATEGORY_ROUTE_TOKEN = new Angular.InjectionToken<any>(
  'POST_CATEGORY_ROUTE',
)
const POST_ROUTE_TOKEN = new Angular.InjectionToken<any>('POST_ROUTE')

@Angular.Component({
  imports: [Link, Outlet],
  template: `
    <div>
      <h1 data-testid="posts-heading">Posts</h1>
      <a [link]="{ to: postCategoryRoute.fullPath, params: { category: 'all' } }" data-testid="all-category-link">All Categories</a>
      <a [link]="{ to: postCategoryRoute.fullPath, params: { category: 'first' } }" data-testid="first-category-link">First Category</a>
      <outlet />
    </div>
  `,
})
class PostsComponent {
  postCategoryRoute = Angular.inject(POST_CATEGORY_ROUTE_TOKEN)
}

@Angular.Component({
  imports: [Link, Outlet],
  template: `
    <div>
      <h1 data-testid="post-category-heading">Post Categories</h1>
      @for (post of posts(); track post.id) {
        <a [link]="{ from: postCategoryRoute.fullPath, to: './$postId', params: { postId: post.id === 1 ? 'one' : 'two' } }" [attr.data-testid]="'post-' + (post.id === 1 ? 'one' : 'two') + '-link'">{{ post.title }}</a>
      }
      <outlet />
    </div>
  `,
})
class PostCategoryComponent {
  postCategoryRoute = Angular.inject(POST_CATEGORY_ROUTE_TOKEN)
  loaderData = this.postCategoryRoute.injectLoaderData()
  posts = Angular.computed(() => this.loaderData().posts)
}

@Angular.Component({
  template: `
    <div>
      <h1 data-testid="post-heading">Post Route</h1>
      <div>
        Category_Param: <span data-testid="param_category_value">{{ params().category }}</span>
      </div>
      <div>
        PostId_Param: <span data-testid="param_postId_value">{{ params().postId }}</span>
      </div>
      <div>
        PostId: <span data-testid="post_id_value">{{ loaderData().post.id }}</span>
      </div>
      <div>
        Title: <span data-testid="post_title_value">{{ loaderData().post.title }}</span>
      </div>
      <div>
        Category: <span data-testid="post_category_value">{{ loaderData().post.category }}</span>
      </div>
    </div>
  `,
  standalone: true,
})
class PostComponent {
  postRoute = Angular.inject(POST_ROUTE_TOKEN)
  params = injectParams({ from: this.postRoute.fullPath })
  loaderData = this.postRoute.injectLoaderData()
}

test('injectParams must return parsed result if applicable.', async () => {
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
    component: () => PostsComponent,
  })

  const postCategoryRoute = createRoute({
    getParentRoute: () => postsRoute,
    path: 'category_{$category}',
    component: () => PostCategoryComponent,
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
    component: () => PostComponent,
    loader: ({ params }) => {
      return { post: posts.find((post) => post.id === parseInt(params.postId)) }
    },
    params: {
      parse: (params) => {
        mockedfn()
        return {
          ...params,
          postId: params.postId === 'one' ? '1' : '2',
        }
      },
    },
  })

  window.history.replaceState({}, '', '/posts')

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      postsRoute.addChildren([postCategoryRoute.addChildren([postRoute])]),
    ]),
    defaultPendingMinMs: 0,
  })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
    providers: [
      {
        provide: POST_CATEGORY_ROUTE_TOKEN,
        useValue: postCategoryRoute,
      },
      {
        provide: POST_ROUTE_TOKEN,
        useValue: postRoute,
      },
    ],
  })

  await router.load()

  expect(await screen.findByTestId('posts-heading')).toBeTruthy()

  const firstCategoryLink = await screen.findByTestId('first-category-link')

  expect(firstCategoryLink).toBeTruthy()

  mockedfn.mockClear()
  fireEvent.click(firstCategoryLink)

  const firstPostLink = await screen.findByTestId('post-one-link')

  expect(window.location.pathname).toBe('/posts/category_first')
  expect(await screen.findByTestId('post-category-heading')).toBeTruthy()
  // Called by
  // 1. Link with postId: 'one'
  expect(mockedfn).toHaveBeenCalledTimes(1)

  mockedfn.mockClear()
  fireEvent.click(firstPostLink)
  // 1. Called on navigate to category one
  // 2. Called on navigate to category one

  const allCategoryLink = await screen.findByTestId('all-category-link')
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
  expect(await screen.findByTestId('post-heading')).toBeTruthy()
  expect(renderedPost).toEqual(posts[0])
  expect(renderedPost.category).toBe('one')
  expect(paramCategoryValue.textContent).toBe('one')
  expect(paramPostIdValue.textContent).toBe('1')
  expect(mockedfn).toHaveBeenCalledTimes(2)
  expect(allCategoryLink).toBeTruthy()

  mockedfn.mockClear()
  fireEvent.click(allCategoryLink)
  // 1. Link with postId: 'two'

  const secondPostLink = await screen.findByTestId('post-two-link')

  expect(window.location.pathname).toBe('/posts/category_all')
  expect(await screen.findByTestId('post-category-heading')).toBeTruthy()
  expect(secondPostLink).toBeTruthy()
  // The params.parse function is called on 2 places:
  // 1. When rendering a link
  // 2. When navigating to a post
  // When going back from a post to the category page with all links,
  // it only needs to update the links. Angular inputs objects are stable,
  // so the computed signals will detect that the object is the same and
  // don't recalculate the signal graph of the first link.
  expect(mockedfn).toHaveBeenCalledTimes(1)

  mockedfn.mockClear()

  fireEvent.click(secondPostLink)
  // 1. Called on navigate to category two
  // 2. Called on navigate to category two

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
  expect(await screen.findByTestId('post-heading')).toBeTruthy()
  expect(renderedPost).toEqual(posts[1])
  expect(renderedPost.category).toBe('two')
  expect(paramCategoryValue.textContent).toBe('all')
  expect(paramPostIdValue.textContent).toBe('2')
  expect(mockedfn).toHaveBeenCalledTimes(2)
})
