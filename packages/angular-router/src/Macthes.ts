import { Component, effect } from '@angular/core'
import { injectRouterState } from './injectRouterState'
import { injectDynamicRenderer } from './dynamicRenderer'
import { RouteMatch } from './Match'
import { injectTransitionerSetup } from './transitioner'

@Component({ selector: 'router-matches', template: '', standalone: true })
export class Matches {
  private matchId = injectRouterState({
    select: (s) => s.matches[0]?.id,
  })

  renderer = injectDynamicRenderer()
  transitioner = injectTransitionerSetup()

  render = effect(() => {
    const matchId = this.matchId()

    if (!matchId) {
      this.renderer.clear()
      return
    }

    this.renderer.render({
      component: RouteMatch,
      inputs: {
        matchId: () => matchId,
      },
    })
  })
}
