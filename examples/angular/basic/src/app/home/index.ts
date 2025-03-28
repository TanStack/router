import { Component } from '@angular/core';
import { createRoute } from '@tanstack/angular-router'

import { rootRoute } from '../root';

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => Index,
})

@Component({
  template: `
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  `
})
export class Index {}