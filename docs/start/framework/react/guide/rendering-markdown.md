---
id: rendering-markdown
title: Rendering Markdown
---

Use [TanStack Markdown](https://tanstack.com/markdown/latest/docs/overview) to render Markdown in your TanStack Start application. Its React renderer works synchronously during server rendering and client navigation, so content does not need to wait for a client effect.

This guide covers static posts loaded with Content Collections and remote content fetched through a server function. Both use the same Markdown component.

## Rendering Markdown

Install TanStack Markdown:

```bash
npm install @tanstack/markdown
```

Create a shared component that accepts either Markdown source or a parsed document:

```tsx
// src/components/Markdown.tsx
import { Markdown as ReactMarkdown } from '@tanstack/markdown/react'
import type { MarkdownDocument } from '@tanstack/markdown'

type MarkdownProps = {
  content: string | MarkdownDocument
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown headingAnchors>{content}</ReactMarkdown>
    </div>
  )
}
```

Headings receive stable IDs, and `headingAnchors` adds links to them. Raw HTML is escaped and unsafe URL protocols are removed by default. Keep these defaults for remote or user-written content. TanStack Markdown does not execute MDX or implement every CommonMark or GFM feature, so check the [supported syntax](https://tanstack.com/markdown/latest/docs/core-concepts/syntax-profile) when migrating existing content.

Use the `components` prop to customize elements, for example to lazy-load images:

```tsx
<ReactMarkdown
  components={{
    img: (props) => <img {...props} loading="lazy" />,
  }}
>
  {content}
</ReactMarkdown>
```

The examples below use `~/*` for the `src/*` import alias. The `prose` class is optional and requires your own typography styles, such as Tailwind Typography.

## Static Markdown with Content Collections

[Content Collections](https://www.content-collections.dev/docs/quickstart/tanstack-start) loads local Markdown files and validates their frontmatter. Pass the Markdown body from the generated collection to the shared renderer.

### Installation and Configuration

```bash
npm install -D @content-collections/core @content-collections/vite zod
```

```ts
// content-collections.ts
import { defineCollection, defineConfig } from '@content-collections/core'
import { z } from 'zod'

const posts = defineCollection({
  name: 'posts',
  directory: './src/blog',
  include: '*.md',
  schema: z.object({
    title: z.string(),
    published: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string(),
    authors: z.array(z.string()),
    content: z.string(),
  }),
  transform: (post) => ({
    ...post,
    slug: post._meta.path,
  }),
})

export default defineConfig({
  collections: [posts],
})
```

Content Collections already separates frontmatter from `content`, so this transform does not need a second frontmatter parser.

Add the plugin to your existing Vite configuration, keeping any deployment plugins your app needs:

```ts
// vite.config.ts
import contentCollections from '@content-collections/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    contentCollections(),
    tsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart(),
    viteReact(),
  ],
})
```

Add the generated collection alias to your existing `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"],
      "content-collections": ["./.content-collections/generated"]
    }
  }
}
```

Add `.content-collections` to `.gitignore`. Starting the Vite dev server or running a build generates the collection.

### Creating a Post

Create `src/blog/hello-world.md`:

````markdown
---
title: Hello World
published: '2026-01-15'
description: My first blog post
authors:
  - Jane Doe
---

Welcome to my blog! This is my first post.

## Getting Started

Here's some content with **bold** and _italic_ text.

```javascript
console.log('Hello, world!')
```
````

### Listing Posts

```tsx
// src/routes/blog.index.tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { allPosts } from 'content-collections'

export const Route = createFileRoute('/blog/')({
  component: BlogIndex,
})

function BlogIndex() {
  const sortedPosts = [...allPosts].sort((a, b) =>
    b.published.localeCompare(a.published),
  )

  return (
    <main>
      <h1>Blog</h1>
      <ul>
        {sortedPosts.map((post) => (
          <li key={post.slug}>
            <Link to="/blog/$slug" params={{ slug: post.slug }}>
              {post.title}
            </Link>
            <p>{post.description}</p>
            <time dateTime={post.published}>{post.published}</time>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

### Rendering a Post

```tsx
// src/routes/blog.$slug.tsx
import { createFileRoute, notFound } from '@tanstack/react-router'
import { allPosts } from 'content-collections'
import { Markdown } from '~/components/Markdown'

export const Route = createFileRoute('/blog/$slug')({
  loader: ({ params }) => {
    const post = allPosts.find((post) => post.slug === params.slug)
    if (!post) {
      throw notFound()
    }
    return post
  },
  component: BlogPost,
})

function BlogPost() {
  const post = Route.useLoaderData()

  return (
    <article>
      <h1>{post.title}</h1>
      <p>
        By {post.authors.join(', ')} on {post.published}
      </p>
      <Markdown content={post.content} className="prose" />
    </article>
  )
}
```

The renderer parses the Markdown synchronously and renders React elements on both the server and client.

## Remote Markdown with a Server Function

Fetch remote content in a server function and parse it before returning it to the route. Install `gray-matter` if the remote files contain frontmatter:

```bash
npm install gray-matter
```

Keep the repository, branch, and content directory in server code. Validate the requested filename before building the URL:

```ts
// src/utils/docs.ts
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { parseMarkdown } from '@tanstack/markdown/parser'
import matter from 'gray-matter'

export const fetchDocs = createServerFn({ method: 'GET' })
  .validator((slug: unknown) => {
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error('Invalid document slug')
    }
    return slug
  })
  .handler(async ({ data: slug }) => {
    // Replace this with your public repository's content directory.
    const baseUrl =
      'https://raw.githubusercontent.com/your-org/your-repo/main/docs'
    const response = await fetch(`${baseUrl}/${slug}.md`)

    if (response.status === 404) {
      throw notFound()
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status}`)
    }

    const { data, content } = matter(await response.text())

    return {
      title: typeof data.title === 'string' ? data.title : slug,
      document: parseMarkdown(content),
    }
  })
```

```tsx
// src/routes/docs.$slug.tsx
import { createFileRoute } from '@tanstack/react-router'
import { Markdown } from '~/components/Markdown'
import { fetchDocs } from '~/utils/docs'

export const Route = createFileRoute('/docs/$slug')({
  loader: ({ params }) => fetchDocs({ data: params.slug }),
  component: DocsPage,
})

function DocsPage() {
  const { title, document } = Route.useLoaderData()

  return (
    <article>
      <h1>{title}</h1>
      <Markdown content={document} className="prose" />
    </article>
  )
}
```

Relative Markdown links and image URLs resolve against your app's URL, not the source repository. Use app-relative or absolute URLs in the content, or transform them for your site's route and asset layout.

## Syntax Highlighting with TanStack Highlight

Install [TanStack Highlight](https://tanstack.com/highlight/latest/docs/overview). The Markdown adapter requires version `0.0.6` or newer:

```bash
npm install @tanstack/highlight
```

Register the languages your content uses and create the Markdown adapter:

```ts
// src/utils/markdown-highlighter.ts
import { createHighlighter } from '@tanstack/highlight/core'
import { js } from '@tanstack/highlight/languages/js'
import { plaintext } from '@tanstack/highlight/languages/plaintext'
import { ts } from '@tanstack/highlight/languages/ts'
import { tsx } from '@tanstack/highlight/languages/tsx'
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown'

const highlighter = createHighlighter({
  languages: [plaintext, js, ts, tsx],
})

export const highlightMarkdownCode =
  createTanStackMarkdownHighlighter(highlighter)
```

Update the shared component to pass the highlighter and include its theme styles:

```tsx
// src/components/Markdown.tsx
import { createThemeCss } from '@tanstack/highlight/theme'
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark'
import { githubLightTheme } from '@tanstack/highlight/themes/github-light'
import { Markdown as ReactMarkdown } from '@tanstack/markdown/react'
import type { MarkdownDocument } from '@tanstack/markdown'
import { highlightMarkdownCode } from '~/utils/markdown-highlighter'

const themeCss = createThemeCss({
  light: githubLightTheme,
  dark: githubDarkTheme,
  lightSelector: '.markdown-renderer',
  darkSelector: '.dark .markdown-renderer',
  codeBlockSelector: '.markdown-renderer pre.tm-code',
  lineNumbersSelector: '.markdown-renderer .tm-code--line-numbers',
})

type MarkdownProps = {
  content: string | MarkdownDocument
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={`markdown-renderer ${className ?? ''}`}>
      <style>{themeCss}</style>
      <ReactMarkdown headingAnchors highlighter={highlightMarkdownCode}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
```

The adapter returns escaped token markup inside the renderer's own `<pre><code>` elements. Unknown languages fall back to plain text. Add a `dark` class to an ancestor to select the dark theme. See the [syntax highlighting guide](https://tanstack.com/markdown/latest/docs/guides/syntax-highlighting) for line numbers and highlighted lines.

## Table of Contents

To collect headings, add the docs preset when parsing the document:

```ts
import { docsMarkdownExtensions } from '@tanstack/markdown/extensions/docs'
import { parseMarkdown } from '@tanstack/markdown/parser'

const document = parseMarkdown(content, {
  extensions: docsMarkdownExtensions(),
})

const headings = document.headings ?? []
// Each heading has an id, text, and level.
```

Use this in the server function, then render links to each heading's `id`. The [docs preset guide](https://tanstack.com/markdown/latest/docs/guides/docs-preset) also covers callouts and custom comment components. Those features need the same extensions passed to the renderer.
