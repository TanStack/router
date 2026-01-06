import { Component } from '@angular/core'
import { RouterProvider } from '@tanstack/angular-router'
import { router } from './router'

@Component({
  selector: 'app-root',
  imports: [RouterProvider],
  template: `<router-provider [router]="router" />`,
})
export class App {
  router = router
}
