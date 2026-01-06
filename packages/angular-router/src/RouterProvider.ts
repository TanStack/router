import * as Angular from '@angular/core'
import {
  AnyRouter,
  RegisteredRouter,
  RouterOptions,
} from '@tanstack/router-core'
import { injectDynamicRenderer } from './dynamicRenderer'
import { Matches } from './Matches'
import { getRouterInjectionKey } from './routerInjectionToken'

@Angular.Component({
  selector: 'router-provider',
  template: '',
  standalone: true,
})
export class RouterProvider<TRouter extends AnyRouter = RegisteredRouter> {
  context: Angular.InputSignal<RouterInputs<TRouter>['context']> =
    Angular.input<RouterInputs<TRouter>['context']>({})

  options: Angular.InputSignal<
    Omit<RouterInputs<TRouter>, 'router' | 'context'>
  > = Angular.input<Omit<RouterInputs<TRouter>, 'router' | 'context'>>({})

  router = Angular.input.required<AnyRouter>()
  renderer = injectDynamicRenderer()

  updateRouter = Angular.effect(() => {
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

  render = Angular.effect(() => {
    const router = Angular.untracked(this.router)
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
