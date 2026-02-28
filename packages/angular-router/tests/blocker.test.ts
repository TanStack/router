import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, beforeEach, describe, expect, test, vi  } from 'vitest'
import combinate from 'combinate'
import {
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  injectBlocker,
  injectNavigate,
  redirect,
} from '../src'
import type { InjectBlockerOpts, ShouldBlockFn } from '../src'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  vi.resetAllMocks()
  vi.useRealTimers()
})

interface BlockerTestOpts {
  blockerFn: ShouldBlockFn
  disabled?: boolean
  ignoreBlocker?: boolean
}

const BLOCKER_OPTIONS_TOKEN = new Angular.InjectionToken<InjectBlockerOpts>(
  'BLOCKER_OPTIONS',
)
const IGNORE_BLOCKER_TOKEN = new Angular.InjectionToken<boolean>(
  'IGNORE_BLOCKER',
)

@Angular.Component({
  imports: [Link],
  template: `
    <h1>Index</h1>
    <a [link]="{ to: '/posts', ignoreBlocker }">link to posts</a>
    <a [link]="{ to: '/foo', ignoreBlocker }">link to foo</a>
    <button (click)="navigate({ to: '/posts', ignoreBlocker })">button</button>
  `,
})
class IndexComponent {
  navigate = injectNavigate()
  blocker = injectBlocker(Angular.inject(BLOCKER_OPTIONS_TOKEN))
  ignoreBlocker = Angular.inject(IGNORE_BLOCKER_TOKEN)
}

@Angular.Component({
  template: '<h1>Posts</h1>',
})
class PostsComponent {}

@Angular.Component({
  template: '<h1>Foo</h1>',
})
class FooComponent {}

@Angular.Component({
  template: '<h1>Bar</h1>',
})
class BarComponent {}

async function setup({ blockerFn, disabled, ignoreBlocker }: BlockerTestOpts) {
  const _mockBlockerFn = vi.fn(blockerFn)
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexComponent,
  })
  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: () => PostsComponent,
  })

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    beforeLoad: () => {
      throw redirect({ to: '/bar' })
    },
    component: () => FooComponent,
  })
  const barRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
    component: () => BarComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      postsRoute,
      fooRoute,
      barRoute,
    ]),
  })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
    providers: [
      {
        provide: BLOCKER_OPTIONS_TOKEN,
        useValue: {
          shouldBlockFn: _mockBlockerFn,
          disabled,
        } as InjectBlockerOpts,
      },
      {
        provide: IGNORE_BLOCKER_TOKEN,
        useValue: ignoreBlocker,
      },
    ],
  })

  expect(window.location.pathname).toBe('/')

  const postsLink = await screen.findByRole('link', { name: 'link to posts' })
  const fooLink = await screen.findByRole('link', { name: 'link to foo' })
  const button = await screen.findByRole('button', { name: 'button' })

  return {
    router,
    clickable: { postsLink, fooLink, button },
    blockerFn: _mockBlockerFn,
  }
}

const clickTarget = ['postsLink' as const, 'button' as const]

describe('Blocker', () => {
  const doesNotBlockTextMatrix = combinate({
    opts: [
      {
        blockerFn: () => false,
        disabled: false,
        ignoreBlocker: undefined,
      },
      {
        blockerFn: async () =>
          await new Promise<boolean>((resolve) => resolve(false)),
        disabled: false,
        ignoreBlocker: false,
      },
      {
        blockerFn: () => true,
        disabled: true,
        ignoreBlocker: false,
      },
      {
        blockerFn: () => true,
        disabled: false,
        ignoreBlocker: true,
      },
    ],
    clickTarget,
  })
  test.each(doesNotBlockTextMatrix)(
    'does not block navigation with blockerFn = $flags.blockerFn, ignoreBlocker = $flags.ignoreBlocker, clickTarget = $clickTarget',
    async ({ opts, clickTarget }) => {
      const { clickable, blockerFn } = await setup(opts)

      fireEvent.click(clickable[clickTarget])
      expect(await screen.findByRole('heading', { name: 'Posts' })).toBeTruthy()
      expect(window.location.pathname).toBe('/posts')
      if (opts.ignoreBlocker || opts.disabled)
        expect(blockerFn).not.toHaveBeenCalled()
    },
  )

  const blocksTextMatrix = combinate({
    opts: [
      {
        blockerFn: () => true,
        disabled: false,
        ignoreBlocker: undefined,
      },
      {
        blockerFn: async () =>
          await new Promise<boolean>((resolve) => resolve(true)),
        disabled: false,
        ignoreBlocker: false,
      },
    ],
    clickTarget,
  })
  test.each(blocksTextMatrix)(
    'blocks navigation with condition = $flags.blockerFn, ignoreBlocker = $flags.ignoreBlocker, clickTarget = $clickTarget',
    async ({ opts, clickTarget }) => {
      const { clickable } = await setup(opts)

      fireEvent.click(clickable[clickTarget])
      await expect(
        screen.findByRole('heading', { name: 'Posts' }, { timeout: 100 }),
      ).rejects.toThrow()
      expect(window.location.pathname).toBe('/')
    },
  )

  test('blocker function is only called once when navigating to a route that redirects', async () => {
    const { clickable, blockerFn } = await setup({
      blockerFn: () => false,
      ignoreBlocker: false,
    })
    fireEvent.click(clickable.fooLink)
    expect(await screen.findByRole('heading', { name: 'Bar' })).toBeTruthy()
    expect(window.location.pathname).toBe('/bar')
    expect(blockerFn).toHaveBeenCalledTimes(1)
  })
})
