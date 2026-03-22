# LLM Optimization (LLMO)

Optimize your app for LLM crawlers and AI assistants.

## What is LLMO?

LLM Optimization ensures your content is accessible to AI crawlers (ChatGPT, Claude, Perplexity, etc.) that index web content for their knowledge bases.

## Structured Content

```tsx
export const Route = createFileRoute('/docs/$slug')({
  head: ({ loaderData }) => ({
    title: loaderData.title,
    meta: [
      { name: 'description', content: loaderData.summary },
      // Structured data for LLMs
      { name: 'article:author', content: loaderData.author },
      { name: 'article:published_time', content: loaderData.publishedAt },
    ],
  }),
})
```

## JSON-LD Schema

```tsx
function ArticlePage({ article }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary,
    author: {
      '@type': 'Person',
      name: article.author,
    },
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>{article.content}</article>
    </>
  )
}
```

## llms.txt File

Provide guidance for LLM crawlers:

```tsx
// routes/llms[.]txt.ts
export const APIRoute = createAPIFileRoute('/llms.txt')({
  GET: async () => {
    const content = `# MyApp Documentation

## About
MyApp is a task management application.

## Key Features
- Task creation and management
- Team collaboration
- Real-time updates

## API Documentation
See /docs/api for full API reference.

## Contact
support@myapp.com`

    return new Response(content, {
      headers: { 'Content-Type': 'text/plain' },
    })
  },
})
```

## Content Accessibility

```tsx
// Ensure content is in initial HTML (not client-rendered)
export const Route = createFileRoute('/docs/$slug')({
  loader: async ({ params }) => {
    // Content loaded during SSR = accessible to LLMs
    return { content: await getDocContent(params.slug) }
  },
  component: DocPage,
})

function DocPage() {
  const { content } = Route.useLoaderData()

  // Render content directly (not lazy-loaded)
  return (
    <article>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </article>
  )
}
```

## Best Practices

1. **SSR all content**: LLMs can't execute JavaScript
2. **Semantic HTML**: Use proper headings, lists, articles
3. **Clear structure**: Logical content hierarchy
4. **Meta descriptions**: Accurate summaries
5. **Schema markup**: JSON-LD for structured data
6. **llms.txt**: Guide for AI crawlers
