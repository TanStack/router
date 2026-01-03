import { Component, computed } from '@angular/core';
import { createRoute, Outlet, RouterLink } from '@tanstack/angular-router';
import { Route as RootRoute } from './root.route';
import { injectSearch, injectNavigate } from '@tanstack/angular-router';
import { z } from 'zod';

// Mock data
const POSTS = [
  { id: '1', title: 'First Post', content: 'This is the first post content.', author: 'Alice' },
  { id: '2', title: 'Second Post', content: 'This is the second post content.', author: 'Bob' },
  { id: '3', title: 'Third Post', content: 'This is the third post content.', author: 'Charlie' },
  { id: '4', title: 'Fourth Post', content: 'This is the fourth post content.', author: 'Alice' },
  { id: '5', title: 'Fifth Post', content: 'This is the fifth post content.', author: 'Bob' },
];

@Component({
  selector: 'app-posts',
  imports: [Outlet, RouterLink],
  template: `
    <div class="posts">
      <outlet />

      <h2>Posts</h2>

      <div class="controls">
        <label>
          Filter by author:
          <select [value]="search().author || ''" (change)="updateAuthor($event)">
            <option value="">All Authors</option>
            <option value="Alice">Alice</option>
            <option value="Bob">Bob</option>
            <option value="Charlie">Charlie</option>
          </select>
        </label>

        <label>
          Sort by:
          <select [value]="search().sort || 'id'" (change)="updateSort($event)">
            <option value="id">ID</option>
            <option value="title">Title</option>
            <option value="author">Author</option>
          </select>
        </label>

        <label>
          Page:
          <input type="number" [value]="search().page || 1" (input)="updatePage($event)" min="1" />
        </label>
      </div>

      <div class="posts-list">
        @for (post of filteredPosts(); track post.id) {
          <div class="post-card">
            <h3>{{ post.title }}</h3>
            <p class="author">By {{ post.author }}</p>
            <p class="content">{{ post.content }}</p>
            <a [routerLink]="{ to: '/posts/$postId', params: { postId: post.id } }">View Post</a>
          </div>
        }
      </div>

      @if (filteredPosts().length === 0) {
        <p class="no-posts">No posts found.</p>
      }
    </div>
  `,
  styles: [
    `
      .posts {
        padding: 2rem;
      }
      h2 {
        color: #333;
        margin-bottom: 1.5rem;
      }
      .controls {
        display: flex;
        gap: 1rem;
        margin-bottom: 2rem;
        padding: 1rem;
        background-color: #f5f5f5;
        border-radius: 8px;
        flex-wrap: wrap;
      }
      .controls label {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font-weight: 500;
      }
      .controls select,
      .controls input {
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
      }
      .posts-list {
        display: grid;
        gap: 1rem;
      }
      .post-card {
        padding: 1.5rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        background-color: white;
      }
      .post-card:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }
      .post-card h3 {
        margin: 0 0 0.5rem 0;
        color: #007bff;
      }
      .post-card .author {
        color: #666;
        font-size: 0.9rem;
        margin: 0 0 0.5rem 0;
      }
      .post-card .content {
        color: #333;
        margin: 0;
      }
      .no-posts {
        text-align: center;
        color: #666;
        padding: 2rem;
      }
    `,
  ],
})
class PostsComponent {
  // Inject search params
  search = injectSearch({ from: '/posts' });
  navigate = injectNavigate({ from: '/posts' });

  // Computed filtered and sorted posts
  filteredPosts = computed(() => {
    const searchParams = this.search();
    let posts = [...POSTS];

    // Filter by author
    if (searchParams.author) {
      posts = posts.filter((p) => p.author === searchParams.author);
    }

    // Sort
    const sortBy = searchParams.sort || 'id';
    posts.sort((a, b) => {
      if (sortBy === 'id') {
        return a.id.localeCompare(b.id);
      }
      return a[sortBy as keyof typeof a].localeCompare(b[sortBy as keyof typeof b] as string);
    });

    // Pagination (simple - just show first 3 for demo)
    const page = searchParams.page || 1;
    const pageSize = 3;
    const start = (page - 1) * pageSize;
    return posts.slice(start, start + pageSize);
  });

  updateAuthor(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.navigate({
      to: '/posts',
      search: {
        ...this.search(),
        author: target.value || undefined,
        page: 1, // Reset to first page
      },
    });
  }

  updateSort(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.navigate({
      to: '/posts',
      search: {
        ...this.search(),
        sort: target.value,
      },
    });
  }

  updatePage(event: Event) {
    const target = event.target as HTMLInputElement;
    const page = parseInt(target.value, 10);
    if (page > 0) {
      this.navigate({
        to: '/posts',
        search: {
          ...this.search(),
          page: page,
        },
      });
    }
  }
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/posts',
  // TODO: make it a function to allow using this at the top of the file
  component: PostsComponent,
  validateSearch: z.object({
    author: z.string().optional(),
    sort: z.string().optional(),
    page: z.number().optional(),
  }),
});
