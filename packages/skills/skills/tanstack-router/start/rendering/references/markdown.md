# Rendering Markdown

Render markdown content in TanStack Start.

## Basic Markdown Rendering

```tsx
import { marked } from 'marked'

const getMarkdownContent = createServerFn()
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const content = await fs.readFile(`./content/${data.slug}.md`, 'utf-8')
    const html = await marked(content)
    return { html }
  })

function MarkdownPage() {
  const { html } = Route.useLoaderData()

  return (
    <article className="prose" dangerouslySetInnerHTML={{ __html: html }} />
  )
}
```

## With Frontmatter

```tsx
import matter from 'gray-matter'
import { marked } from 'marked'

const getPost = createServerFn().handler(async ({ data }) => {
  const file = await fs.readFile(`./posts/${data.slug}.md`, 'utf-8')
  const { data: frontmatter, content } = matter(file)
  const html = await marked(content)

  return {
    title: frontmatter.title,
    date: frontmatter.date,
    html,
  }
})
```

## MDX Support

```tsx
// Install: npm install @mdx-js/rollup @mdx-js/react

// app.config.ts
import mdx from '@mdx-js/rollup'

export default defineConfig({
  vite: {
    plugins: [mdx()],
  },
})
```

```tsx
// Import MDX directly
import Content from './content/about.mdx'

function AboutPage() {
  return <Content />
}
```

## Syntax Highlighting

```tsx
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(code, { language }).value
    },
  }),
)

// Or use Shiki for better highlighting
import { codeToHtml } from 'shiki'

async function highlightCode(code: string, lang: string) {
  return codeToHtml(code, { lang, theme: 'github-dark' })
}
```

## Table of Contents

```tsx
import { marked } from 'marked'

function extractHeadings(markdown: string) {
  const headings: { level: number; text: string; id: string }[] = []

  const renderer = new marked.Renderer()
  renderer.heading = (text, level) => {
    const id = text.toLowerCase().replace(/\s+/g, '-')
    headings.push({ level, text, id })
    return `<h${level} id="${id}">${text}</h${level}>`
  }

  marked(markdown, { renderer })
  return headings
}
```

## Content Collections

```tsx
// lib/content.ts
export async function getAllPosts() {
  const files = await fs.readdir('./content/posts')

  return Promise.all(
    files.map(async (file) => {
      const content = await fs.readFile(`./content/posts/${file}`, 'utf-8')
      const { data } = matter(content)
      return { slug: file.replace('.md', ''), ...data }
    }),
  )
}
```
