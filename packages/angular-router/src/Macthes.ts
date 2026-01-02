import { Directive, effect } from '@angular/core'
import { injectRouterState } from './injectRouterState'
import { injectDynamicRenderer } from './dynamicRenderer'
import { RouteMatch } from './Match'

@Directive({ selector: 'router-matches' })
export class Matches {
  private matchId = injectRouterState({
    select: (s) => s.matches[0]?.id,
  })

  renderer = injectDynamicRenderer()

  render = effect(() => {
    const matchId = this.matchId()
    if (matchId) {
      this.renderer.clear()
    }

    this.renderer.render({
      component: RouteMatch,
      inputs: {
        matchId: () => matchId,
      },
    })
  })
}
