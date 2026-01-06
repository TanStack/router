import { Component, computed } from '@angular/core'
import { Outlet, Link, createLazyRoute } from '@tanstack/angular-router'

export const Route = createLazyRoute('/posts')({
  component: () => PostsComponent,
})

@Component({
  selector: 'app-posts',
  standalone: true,
  imports: [Outlet, Link],
  template: `
    <div class="p-2 flex gap-2">
      <ul class="list-disc pl-4">
        @for (post of postsWithExtra(); track post.id) {
          <li class="whitespace-nowrap">
            <a
              [link]="{
                to: '/posts/$postId',
                params: { postId: post.id },
              }"
              class="block py-1 px-2 text-blue-600 hover:opacity-75"
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
class PostsComponent {
  posts = Route.injectLoaderData()
  postsWithExtra = computed(() => [
    ...this.posts(),
    { id: 'i-do-not-exist', title: 'Non-existent Post' },
  ])
}
