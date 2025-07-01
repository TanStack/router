import { createServerFileRoute } from '@tanstack/react-start/server'
import { generateSitemap } from '@tanstack/router-sitemap'
import { fetchPosts } from '~/utils/posts'

export const ServerRoute = createServerFileRoute('/sitemap.xml').methods({
  GET: async () => {
    const sitemap = await generateSitemap({
      siteUrl: 'http://localhost:3000',
      priority: 0.5,
      changefreq: 'weekly',
      routes: [
        '/',
        '/posts',
        '/route-a',
        '/route-b',
        '/deferred',
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
        [
          '/posts/$postId/deep',
          async () => {
            const posts = await fetchPosts()
            return posts.map((post) => ({
              path: `/posts/${post.id}/deep`,
              priority: 0.7,
              changefreq: 'weekly',
            }))
          },
        ],
      ],
    })

    return new Response(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
      },
    })
  },
})
