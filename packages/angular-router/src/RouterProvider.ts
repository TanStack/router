import { Component, effect, input, untracked } from '@angular/core'
import { AnyRouter } from '@tanstack/router-core'
import { injectDynamicRenderer } from './dynamicRenderer'
import { Matches } from './Macthes'
import { getRouterInjectionKey } from './routerInjectionToken'

@Component({ selector: 'router-provider', template: '', standalone: true })
export class RouterProvider {
  router = input.required<AnyRouter>()
  renderer = injectDynamicRenderer()

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
