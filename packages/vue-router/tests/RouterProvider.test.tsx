import * as Vue from 'vue'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/vue'
import { createRootRoute, createRouter } from '../src'
import { RouterProvider } from '../src/RouterProvider'

describe('RouterProvider', () => {
  it('should provide context through RouterProvider Wrap (via router options)', async () => {
    const ctxKey = Symbol('ctx') as Vue.InjectionKey<string>

    const rootRoute = createRootRoute({
      component: () => {
        const contextValue = Vue.inject(ctxKey)
        expect(contextValue, 'Context is not provided').not.toBeUndefined()

        return <div>{contextValue}</div>
      },
    })

    const routeTree = rootRoute.addChildren([])

    // Vue RouterProvider supports Wrap via router.options.Wrap, not as a prop
    const WrapComponent = (props: { children: any }) => {
      Vue.provide(ctxKey, 'findMe')
      return props.children
    }

    const router = createRouter({
      routeTree,
      Wrap: WrapComponent,
    })

    const app = render(<RouterProvider router={router} />)

    const indexElem = await app.findByText('findMe')
    expect(indexElem).toBeInTheDocument()
  })
})
