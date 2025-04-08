import { Component } from '@angular/core'
import { createRoute } from '@tanstack/angular-router'
import { fetchPost } from '../posts'
import { postsLayoutRoute } from './layout'

export const postRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: '$postId',
  loader: ({ params }) => fetchPost(params.postId),
  component: () => PostComponent,
})

@Component({
  template: `
    <div class="space-y-2">
      <h4 class="text-xl font-bold">{{ post().title }}</h4>
      <hr class="opacity-20" />
      <div class="text-sm">{{ post().body }}</div>
    </div>
  `,
})
export class PostComponent {
  post = postRoute.loaderData()
}
