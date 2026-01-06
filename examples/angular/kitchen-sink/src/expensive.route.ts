import { Component } from '@angular/core'
import { createLazyRoute, injectErrorState } from '@tanstack/angular-router'
import { injectRouteErrorHandler } from '@tanstack/angular-router/experimental'

@Component({
  selector: 'app-expensive',
  standalone: true,
  template: `
    <div class="p-2">
      I am an "expensive" component... which really just means that I was code-split 😉
    </div>
    <button (click)="throwError()">Throw error</button>
  `,
})
class ExpensiveComponent {
  errorHandler = injectRouteErrorHandler({ from: '/expensive' })

  throwError() {
    this.errorHandler.throw(new Error('Test error'))
  }
}

export const Route = createLazyRoute('/expensive')({
  component: () => ExpensiveComponent,
  errorComponent: () => ExpensiveErrorComponent,
})

@Component({
  selector: 'app-expensive-error',
  standalone: true,
  template: ` <div class="p-2">It broke! {{ errorState.error.message }}</div> `,
})
class ExpensiveErrorComponent {
  errorState = injectErrorState()
}
