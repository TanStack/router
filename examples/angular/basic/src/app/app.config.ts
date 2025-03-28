import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@tanstack/angular-router';

import { routeTree } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter({ routeTree })
  ]
};
