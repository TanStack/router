import * as Angular from '@angular/core'
import { injectRouterState } from './injectRouterState'
import { injectRender } from './renderer/injectRender'
import { RouteMatch } from './Match'
import { injectTransitionerSetup } from './transitioner'

@Angular.Component({
  selector: 'router-matches',
  template: '',
  standalone: true,
})
export class Matches {
  private matchId = injectRouterState({
    select: (s) => s.matches[0]?.id,
  })

  transitioner = injectTransitionerSetup()

  render = injectRender(() => {
    const matchId = this.matchId()

    if (!matchId) {
      return null
    }

    return {
      component: RouteMatch,
      inputs: {
        matchId: () => matchId,
      },
    }
  })
}
