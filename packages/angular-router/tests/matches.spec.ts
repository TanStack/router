import { expect, test } from 'vitest'
import { Component, computed } from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import {
  Link,
  Outlet,
  RouterRoot,
  createRootRoute,
  createRoute,
  createRouter,
  isMatch,
  matches,
  provideRouter,
} from '../src'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => Index,
})

@Component({
  selector: 'Index',
  imports: [Link],
  template: ` <a link="/invoices/">To Invoices</a> `,
})
class Index {}

const invoicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invoices',
  loader: () => [{ id: '1' }, { id: '2' }],
  component: () => Outlet,
})

const invoicesIndexRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '/',
  component: () => InvoicesIndex,
  context: () => ({ permissions: 'permission' }),
})

@Component({
  selector: 'InvoicesIndex',
  template: `
    <section>Loader Matches - {{ loaderDataMatches() }}</section>
    <section>Context Matches - {{ contextMatches() }}</section>
    <section>Incorrect Matches - {{ incorrectMatches() }}</section>
  `,
  host: { style: 'display: block;' },
})
class InvoicesIndex {
  private matches = matches<DefaultRouter>()

  protected loaderDataMatches = computed(() => {
    return this.matches()
      .filter((match) => isMatch(match, 'loaderData.0.id'))
      .map((match) => match.fullPath)
      .join(',')
  })

  protected contextMatches = computed(() => {
    return this.matches()
      .filter((match) => isMatch(match, 'context.permissions'))
      .map((match) => match.fullPath)
      .join(',')
  })

  protected incorrectMatches = computed(() => {
    return this.matches()
      .filter((match) => isMatch(match, 'loaderData.6.id'))
      .map((match) => match.fullPath)
      .join(',')
  })
}

const invoiceRoute = createRoute({
  getParentRoute: () => invoicesRoute,
  path: '$invoiceId',
  validateSearch: () => ({ page: 0 }),
})

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
})

const commentsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'comments/$id',
  validateSearch: () => ({
    page: 0,
    search: '',
  }),
  loader: () =>
    [{ comment: 'one comment' }, { comment: 'two comment' }] as const,
})

const routeTree = rootRoute.addChildren([
  invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
  indexRoute,
  layoutRoute.addChildren([commentsRoute]),
])

const defaultRouter = createRouter({
  routeTree,
})

type DefaultRouter = typeof defaultRouter

test('when filtering matches by loaderData', async () => {
  await render(`<RouterRoot />`, {
    imports: [RouterRoot],
    providers: [provideRouter(defaultRouter)],
  })

  const searchLink = await screen.findByRole('link', { name: 'To Invoices' })

  fireEvent.click(searchLink)

  expect(
    await screen.findByText('Loader Matches - /invoices'),
  ).toBeInTheDocument()

  expect(
    await screen.findByText('Context Matches - /invoices/'),
  ).toBeInTheDocument()

  expect(await screen.findByText('Incorrect Matches -')).toBeInTheDocument()
})
