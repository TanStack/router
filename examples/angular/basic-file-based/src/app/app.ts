import { Component } from '@angular/core'
import { RouterProvider } from '@tanstack/angular-router-experimental'
import { router } from '../router'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterProvider],
  template: `<router-provider [router]="router" />`,
})
export class App {
  router = router
}
