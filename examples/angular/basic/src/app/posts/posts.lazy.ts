import { Component } from '@angular/core'
import { Link, Outlet, createLazyRoute } from '@tanstack/angular-router'

export const Route = createLazyRoute('/posts')({
  component: () => PostsLayoutComponent,
})

@Component({
  imports: [Outlet, Link],
  template: `
    <div class="p-2 flex gap-2">
      <ul class="list-disc pl-4">
        @for (post of posts(); track post.id) {
          <li class="whitespace-nowrap">
            <a
              [link]="{ to: '/posts/$postId', params: { postId: post.id } }"
              class="block py-1 px-2 text-blue-600 hover:opacity-75"
              linkActive="font-bold underline"
            >
              <div>{{ post.title.substring(0, 20) }}</div>
            </a>
          </li>
        }
      </ul>
      <outlet />
    </div>
  `,
})
export class PostsLayoutComponent {
  posts = Route.loaderData()
}
