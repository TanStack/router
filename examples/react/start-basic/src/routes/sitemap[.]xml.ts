import { createServerFileRoute } from '@tanstack/react-start/server'
import { generateSitemap } from '@tanstack/router-sitemap'
import { fetchPosts } from '~/utils/posts'

export const ServerRoute = createServerFileRoute('/sitemap.xml').methods({
  GET: async () => {
    const sitemap = await generateSitemap({
      siteUrl: 'http://localhost:3000',
      defaultPriority: 0.5,
      defaultChangeFreq: 'weekly',
      routes: {
        '/': {},
        '/posts/$postId': async () => {
          const posts = await fetchPosts()
          return posts.map((post) => ({
            path: `/posts/${post.id}`,
            priority: 0.8,
            changefreq: 'daily',
          }))
        },
      },
    })

    return new Response(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
      },
    })
  },
})
