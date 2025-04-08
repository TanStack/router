import { Component } from '@angular/core'
import { createRoute } from '@tanstack/angular-router'

import { postsLayoutRoute } from './layout'

export const postsIndexRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: '/',
  component: () => PostsIndex,
})

@Component({
  template: ` <div>Select a post.</div> `,
})
export class PostsIndex {}
