import { Component } from '@angular/core';
import { createRoute } from '@tanstack/angular-router';
import { Route as PostsRoute } from './posts.route';
import { injectParams, injectNavigate, injectLoaderData } from '@tanstack/angular-router';

// Mock data
const POSTS: Record<string, { id: string; title: string; content: string; author: string }> = {
  '1': {
    id: '1',
    title: 'First Post',
    content: 'This is the first post content. It contains detailed information about the topic.',
    author: 'Alice',
  },
  '2': {
    id: '2',
    title: 'Second Post',
    content: 'This is the second post content. It discusses various aspects of the subject.',
    author: 'Bob',
  },
  '3': {
    id: '3',
    title: 'Third Post',
    content: 'This is the third post content. It provides insights and analysis.',
    author: 'Charlie',
  },
  '4': {
    id: '4',
    title: 'Fourth Post',
    content: 'This is the fourth post content. It explores different perspectives.',
    author: 'Alice',
  },
  '5': {
    id: '5',
    title: 'Fifth Post',
    content: 'This is the fifth post content. It concludes the discussion.',
    author: 'Bob',
  },
};

@Component({
  selector: 'app-post-detail',
  template: `
    <div class="post-detail">
      @if (post()) {
        <button class="back-button" (click)="goBack()">← Back to Posts</button>

        <article>
          <h1>{{ post()!.title }}</h1>
          <p class="meta">
            <span class="author">By {{ post()!.author }}</span>
            <span class="id">Post ID: {{ post()!.id }}</span>
          </p>
          <div class="content">
            <p>{{ post()!.content }}</p>
          </div>
        </article>

        <div class="navigation">
          <h3>Navigation</h3>
          <p>
            Current Post ID: <strong>{{ params().postId }}</strong>
          </p>
          <div class="nav-buttons">
            <button (click)="navigateToPost('1')" [class.active]="params().postId === '1'">
              Post 1
            </button>
            <button (click)="navigateToPost('2')" [class.active]="params().postId === '2'">
              Post 2
            </button>
            <button (click)="navigateToPost('3')" [class.active]="params().postId === '3'">
              Post 3
            </button>
            <button (click)="navigateToPost('4')" [class.active]="params().postId === '4'">
              Post 4
            </button>
            <button (click)="navigateToPost('5')" [class.active]="params().postId === '5'">
              Post 5
            </button>
          </div>
        </div>
      } @else {
        <div class="not-found">
          <h2>Post Not Found</h2>
          <p>Post with ID "{{ params().postId }}" does not exist.</p>
          <button (click)="goBack()">← Back to Posts</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .post-detail {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
      }
      .back-button {
        background-color: #007bff;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        margin-bottom: 2rem;
        font-size: 1rem;
      }
      .back-button:hover {
        background-color: #0056b3;
      }
      article {
        background-color: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        margin-bottom: 2rem;
      }
      article h1 {
        margin: 0 0 1rem 0;
        color: #333;
      }
      .meta {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #eee;
        color: #666;
        font-size: 0.9rem;
      }
      .meta .author {
        font-weight: 500;
      }
      .content {
        color: #333;
        line-height: 1.6;
      }
      .navigation {
        background-color: #f5f5f5;
        padding: 1.5rem;
        border-radius: 8px;
      }
      .navigation h3 {
        margin: 0 0 1rem 0;
        color: #333;
      }
      .nav-buttons {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .nav-buttons button {
        padding: 0.5rem 1rem;
        border: 1px solid #ddd;
        background-color: white;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .nav-buttons button:hover {
        background-color: #f0f0f0;
      }
      .nav-buttons button.active {
        background-color: #007bff;
        color: white;
        border-color: #007bff;
      }
      .not-found {
        text-align: center;
        padding: 3rem;
        background-color: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 8px;
      }
      .not-found h2 {
        color: #856404;
        margin-bottom: 1rem;
      }
      .not-found p {
        color: #856404;
        margin-bottom: 1.5rem;
      }
      .not-found button {
        background-color: #007bff;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
      }
    `,
  ],
})
class PostDetailComponent {
  // Inject route params
  params = Route.injectParams();
  navigate = Route.injectNavigate();

  // Get post from loader data
  post = Route.injectLoaderData();

  navigateToPost(postId: string) {
    this.navigate({
      to: '/posts/$postId',
      params: { postId },
    });
  }

  goBack() {
    this.navigate({
      to: '/posts',
    });
  }
}

export const Route = createRoute({
  getParentRoute: () => PostsRoute,
  path: '/$postId',
  component: PostDetailComponent,
  loader: async ({ params }) => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const postId = params.postId;
    const post = POSTS[postId];

    // Return null if post not found (component handles this case)
    return post || null;
  },
});
