import { createRootRoute } from '@tanstack/angular-router'

import { AppComponent } from "./app"
import { DefaultNotFound } from './not-found'

export const rootRoute = createRootRoute({
  component: AppComponent,
  notFoundComponent: () => DefaultNotFound,
})