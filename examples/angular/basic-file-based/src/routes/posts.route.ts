import { Component, computed } from '@angular/core'
import {
  createFileRoute,
  Link,
  Outlet,
} from '@tanstack/angular-router-experimental'
import { fetchPosts } from '../posts'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: () => PostsLayoutComponent,
})

@Component({
  selector: 'route-component',
  standalone: true,
  template: `
    <div class="p-2 flex gap-2">
      <ul class="list-disc pl-4">
        @for (post of postsWithFake(); track post.id) {
          <li class="whitespace-nowrap">
            <a
              [link]="{
                to: '/posts/$postId',
                params: { postId: post.id },
                activeProps: { class: 'font-bold underline' }
              }"
              class="block py-1 text-blue-600 hover:opacity-75"
            >
              <div>{{ post.title.substring(0, 20) }}</div>
            </a>
          </li>
        }
      </ul>
      <hr />
      <outlet />
    </div>
  `,
  imports: [Link, Outlet],
})
class PostsLayoutComponent {
  posts = Route.injectLoaderData()
  postsWithFake = computed(() => [
    ...this.posts(),
    { id: 'i-do-not-exist', title: 'Non-existent Post' },
  ])
}
