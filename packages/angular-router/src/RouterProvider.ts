import { Component, effect, input, InputSignal, untracked } from '@angular/core'
import {
  AnyRouter,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'
import { injectDynamicRenderer } from './dynamicRenderer'
import { Matches } from './Macthes'
import { getRouterInjectionKey } from './routerInjectionToken'

@Component({ selector: 'router-provider', template: '', standalone: true })
export class RouterProvider<TRouter extends AnyRouter = RegisteredRouter> {
  context: InputSignal<RouterInputs<TRouter>['context']> = input<
    RouterInputs<TRouter>['context']
  >({})

  options: InputSignal<Omit<RouterInputs<TRouter>, 'router' | 'context'>> =
    input<Omit<RouterInputs<TRouter>, 'router' | 'context'>>({})

  router = input.required<AnyRouter>()
  renderer = injectDynamicRenderer()

  updateRouter = effect(() => {
    // This effect will run before we render
    this.router().update({
      ...this.router().options,
      ...this.options(),
      context: {
        ...this.router().options.context,
        ...this.context(),
      },
    })
  })

  render = effect(() => {
    const router = untracked(this.router)
    this.renderer.render({
      component: Matches,
      providers: [
        {
          provide: getRouterInjectionKey(),
          useValue: router,
        },
      ],
    })
  })
}

type RouterInputs<
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
