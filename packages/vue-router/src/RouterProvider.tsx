import * as Vue from 'vue'
import { Matches } from './Matches'
import { getRouterContext } from './routerContext'
import type {
  AnyRouter,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'

// Component that provides router context and renders children
export const RouterContextProvider = Vue.defineComponent({
  name: 'RouterContextProvider',
  props: {
    router: {
      type: Object,
      required: true
    },
    // Rest of router options will be passed as attrs
  },
  setup(props, { attrs, slots }) {
    const router = props.router as AnyRouter
    const restAttrs = attrs as Record<string, any>
    
    // Allow the router to update options on the router instance
    router.update({
      ...router.options,
      ...restAttrs,
      context: {
        ...router.options.context,
        ...((restAttrs.context as Record<string, any>) || {}),
      },
    } as any)

    // Get router context with provide/inject methods
    const routerContext = getRouterContext()
    
    // Provide router to all child components
    routerContext.provide(router)
    
    return () => {
      // Get child content
      const childContent = slots.default?.()
      
      // If a Wrap component is specified in router options, use it
      if (router.options.Wrap) {
        const WrapComponent = router.options.Wrap
        return Vue.h(WrapComponent, null, () => childContent)
      }
      
      // Otherwise just return the child content
      return childContent
    }
  }
})

// The main router provider component that includes matches
export const RouterProvider = Vue.defineComponent({
  name: 'RouterProvider',
  props: {
    router: {
      type: Object,
      required: true
    }
    // Rest of router options will be passed as attrs
  },
  setup(props, { attrs }) {
    const restAttrs = attrs as Record<string, any>
    
    return () => {
      return Vue.h(
        RouterContextProvider,
        {
          router: props.router,
          ...restAttrs
        },
        {
          default: () => Vue.h(Matches)
        }
      )
    }
  }
}) as {
  new <TRouter extends AnyRouter = RegisteredRouter>(): Vue.ComponentOptions & {
    $props: { router: TRouter } & Omit<
      RouterOptions<
        TRouter['routeTree'],
        NonNullable<TRouter['options']['trailingSlash']>,
        false,
        TRouter['history'],
        Record<string, any>
      >,
      'context'
    >
  }
}

export type RouterProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = Omit<
  RouterOptions<
    TRouter['routeTree'],
    NonNullable<TRouter['options']['trailingSlash']>,
    false,
    TRouter['history'],
    TDehydrated
  >,
  'context'
> & {
  router: TRouter
  context?: Partial<
    RouterOptions<
      TRouter['routeTree'],
      NonNullable<TRouter['options']['trailingSlash']>,
      false,
      TRouter['history'],
      TDehydrated
    >['context']
  >
}
