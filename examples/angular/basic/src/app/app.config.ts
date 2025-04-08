import { provideZoneChangeDetection } from '@angular/core'
import { provideRouter } from '@tanstack/angular-router'

import { router } from './app.routes'

import type { ApplicationConfig } from '@angular/core'

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(router),
  ],
}
