import { Component } from '@angular/core'
import {
  createFileRoute,
  injectErrorState,
} from '@tanstack/angular-router-experimental'
import { fetchPost } from '../posts'

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params }) => fetchPost(params.postId),
  errorComponent: () => PostErrorComponent,
  notFoundComponent: () => PostNotFoundComponent,
  component: () => PostComponent,
})

@Component({
  selector: 'post-error',
  standalone: true,
  template: `
    <div>Error: {{ errorState().error.message }}</div>
    <button (click)="errorState().reset()">Reset</button>
  `,
})
class PostErrorComponent {
  errorState = injectErrorState()
}

@Component({
  selector: 'post-not-found',
  standalone: true,
  template: `<p>Post not found</p>`,
})
class PostNotFoundComponent {}

@Component({
  selector: 'route-component',
  standalone: true,
  template: `
    <div class="space-y-2">
      <h4 class="text-xl font-bold underline">{{ post().title }}</h4>
      <div class="text-sm">{{ post().body }}</div>
    </div>
  `,
})
class PostComponent {
  post = Route.injectLoaderData()
}
