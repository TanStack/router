# SEO

Search engine optimization patterns.

## Meta Tags

```tsx
export const Route = createFileRoute('/posts/$postId')({
  head: ({ loaderData }) => ({
    title: `${loaderData.post.title} | My Blog`,
    meta: [
      { name: 'description', content: loaderData.post.excerpt },
      { name: 'author', content: loaderData.post.author.name },
      { name: 'keywords', content: loaderData.post.tags.join(', ') },
    ],
  }),
  loader: async ({ params }) => ({
    post: await fetchPost(params.postId),
  }),
})
```

## Open Graph

```tsx
head: ({ loaderData }) => ({
  title: loaderData.post.title,
  meta: [
    { property: 'og:title', content: loaderData.post.title },
    { property: 'og:description', content: loaderData.post.excerpt },
    { property: 'og:image', content: loaderData.post.coverImage },
    { property: 'og:type', content: 'article' },
    {
      property: 'og:url',
      content: `https://mysite.com/posts/${loaderData.post.id}`,
    },

    // Twitter
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: loaderData.post.title },
    { name: 'twitter:description', content: loaderData.post.excerpt },
    { name: 'twitter:image', content: loaderData.post.coverImage },
  ],
})
```

## Canonical URLs

```tsx
head: () => ({
  links: [{ rel: 'canonical', href: 'https://mysite.com/about' }],
})
```

## Sitemap

```tsx
// routes/sitemap[.]xml.ts
export const APIRoute = createAPIFileRoute('/sitemap.xml')({
  GET: async () => {
    const posts = await db.post.findMany({
      select: { id: true, updatedAt: true },
    })

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://mysite.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${posts
    .map(
      (post) => `
  <url>
    <loc>https://mysite.com/posts/${post.id}</loc>
    <lastmod>${post.updatedAt.toISOString()}</lastmod>
  </url>`,
    )
    .join('')}
</urlset>`

    return new Response(sitemap, {
      headers: { 'Content-Type': 'application/xml' },
    })
  },
})
```

## Robots.txt

```tsx
// routes/robots[.]txt.ts
export const APIRoute = createAPIFileRoute('/robots.txt')({
  GET: async () => {
    const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: https://mysite.com/sitemap.xml`

    return new Response(robots, {
      headers: { 'Content-Type': 'text/plain' },
    })
  },
})
```
