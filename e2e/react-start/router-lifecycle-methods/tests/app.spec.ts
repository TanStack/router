import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { awaitHydrated } from './utils'

test.describe('lifecycle methods - SSR', () => {
  test('home page renders root and index lifecycle context', async ({
    page,
  }) => {
    const response = await page.goto('/')
    const html = await response!.text()
    // function-form context and beforeLoad run on the server and render
    expect(html).toContain('root-context')
    expect(html).toContain('index-beforeLoad')
    expect(html).toContain('index-loader')

    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await expect(page.getByTestId('index-context')).toHaveText('index-context')
    await expect(page.getByTestId('index-beforeLoad')).toHaveText(
      'index-beforeLoad',
    )
    await expect(page.getByTestId('index-loader')).toHaveText('index-loader')
    await awaitHydrated(page)
    // the same values after hydration (context re-run in place, loader restored)
    await expect(page.getByTestId('index-context')).toHaveText('index-context')
    await expect(page.getByTestId('index-loader')).toHaveText('index-loader')
  })

  test('post detail page renders all lifecycle context for root, posts, and post', async ({
    page,
  }) => {
    await page.goto('/posts/1')

    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )
    await expect(page.getByTestId('posts-heading')).toHaveText('Posts Layout')
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('posts-beforeLoad')).toHaveText(
      'posts-beforeLoad',
    )
    await expect(page.getByTestId('post-heading')).toHaveText('First Post')
    await expect(page.getByTestId('post-body')).toHaveText(
      'This is the first post body.',
    )
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-1',
    )
  })

  test('comments page renders full lifecycle context chain', async ({
    page,
  }) => {
    await page.goto('/posts/1/comments')

    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-1',
    )
    await expect(page.getByTestId('comments-heading')).toHaveText('Comments')
    await expect(page.getByTestId('comments-context')).toHaveText(
      'comments-context-1',
    )
    await expect(page.getByTestId('comments-beforeLoad')).toHaveText(
      'comments-beforeLoad-1',
    )
    await expect(page.getByTestId('comment-1')).toHaveText(
      'Alice: Great first post!',
    )
    await expect(page.getByTestId('comment-2')).toHaveText(
      'Bob: Welcome to the blog.',
    )
  })

  test('lifecycle context includes correct param values for post 2', async ({
    page,
  }) => {
    await page.goto('/posts/2')

    await expect(page.getByTestId('post-heading')).toHaveText('Second Post')
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-2',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-2',
    )
  })
})

test.describe('lifecycle methods - client navigation', () => {
  test('navigating from home to post detail renders correct context', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)

    await page.getByTestId('link-post-1').click()
    await expect(page.getByTestId('post-heading')).toHaveText('First Post')
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-1',
    )
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
  })

  test('navigating between posts updates param-dependent context', async ({
    page,
  }) => {
    await page.goto('/posts/1')
    await awaitHydrated(page)
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )

    await page.getByTestId('link-post-2').click()
    await expect(page.getByTestId('post-heading')).toHaveText('Second Post')
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-2',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-2',
    )
  })

  test('navigating from post back to home renders index context', async ({
    page,
  }) => {
    await page.goto('/posts/1')
    await awaitHydrated(page)

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await expect(page.getByTestId('index-context')).toHaveText('index-context')
    await expect(page.getByTestId('index-beforeLoad')).toHaveText(
      'index-beforeLoad',
    )
    await expect(page.getByTestId('index-loader')).toHaveText('index-loader')
  })

  test('navigating to comments renders nested context chain', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)

    await page.getByTestId('link-post-1-comments').click()
    await expect(page.getByTestId('comments-heading')).toHaveText('Comments')
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('comments-context')).toHaveText(
      'comments-context-1',
    )
    await expect(page.getByTestId('comments-beforeLoad')).toHaveText(
      'comments-beforeLoad-1',
    )
  })

  test('posts layout shows posts index when navigating to /posts', async ({
    page,
  }) => {
    await page.goto('/posts')

    await expect(page.getByTestId('posts-heading')).toHaveText('Posts Layout')
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('posts-index-text')).toHaveText(
      'Select a post from the list above.',
    )
    await expect(page.getByTestId('post-context')).not.toBeVisible()
  })
})
