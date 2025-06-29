import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sitemapPlugin } from '@tanstack/router-sitemap/vite-plugin'
import { fetchPosts } from './src/posts'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sitemapPlugin({
      sitemap: {
        siteUrl: 'http://localhost:3000',
        priority: 0.5,
        changefreq: 'weekly',
        routes: [
          '/',
          '/posts',
          [
            '/posts/$postId',
            async () => {
              const posts = await fetchPosts()
              return posts.map((post) => ({
                path: `/posts/${post.id}`,
                priority: 0.8,
                changefreq: 'daily',
              }))
            },
          ],
          '/route-a',
          '/route-b',
        ],
      },
    }),
  ],
})
