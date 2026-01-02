import { Directive, effect, input, untracked } from '@angular/core'
import { AnyRouter } from '@tanstack/router-core'
import { injectDynamicRenderer } from './dynamicRenderer'
import { Matches } from './Macthes'
import { getRouterInjectionKey } from './routerInjectionToken'

@Directive({ selector: 'router-provider', standalone: true })
export class RouterProvider {
  router = input.required<AnyRouter>()
  renderer = injectDynamicRenderer()

  render = effect(() => {
    this.renderer.render({
      component: Matches,
      providers: [
        {
          provide: getRouterInjectionKey(),
          useValue: untracked(this.router),
        },
      ],
    })
  })
}
