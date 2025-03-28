import { Component } from '@angular/core'
import { createRoute } from '@tanstack/angular-router'
import { fetchPost } from '../posts'
import { postsLayoutRoute } from "./layout"

export const postRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: '$postId',
  loader: ({ params }: any) => fetchPost(params.postId),
  component: () => PostComponent,
})

@Component({
  template: `
    <div className="space-y-2">
      <h4 className="text-xl font-bold">{{post()?.title}}</h4>
      <hr className="opacity-20" />
      <div className="text-sm">{{post()?.body}}</div>
    </div>
  `
})
export class PostComponent {
  post = postRoute.loaderData()
}