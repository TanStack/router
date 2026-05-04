/**
 * Server-only markdown renderer. None of these modules ship to the
 * client bundle — the only callers (`postRenderer.renderPostBody`) are
 * imported behind an `import.meta.env.SSR` guard, so Vite's env
 * substitution + rolldown DCE drop the dynamic-import branch on the
 * client build, leaving the entire markdown + highlighter graph
 * unreachable.
 *
 * Note: highlight-language registrations live inside `renderMarkdown`
 * (lazily, behind a one-shot guard) instead of at module top-level.
 * That keeps `markdown.ts` free of import-time side effects, which
 * lets rolldown's tree-shaker drop the entire module from the client
 * build once `renderMarkdown` becomes unreachable.
 */
import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'

let registered = false
function registerLanguagesOnce(): void {
  if (registered) return
  registered = true
  hljs.registerLanguage('javascript', javascript)
  hljs.registerLanguage('typescript', typescript)
  hljs.registerLanguage('jsx', javascript)
  hljs.registerLanguage('tsx', typescript)
  hljs.registerLanguage('xml', xml)
  hljs.registerLanguage('html', xml)
  hljs.registerLanguage('bash', bash)
  hljs.registerLanguage('sh', bash)
  hljs.registerLanguage('shell', bash)
  hljs.registerLanguage('json', json)

  const renderer = new marked.Renderer()
  renderer.code = ({ text, lang }) => {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    const highlighted =
      language === 'plaintext'
        ? escape(text)
        : hljs.highlight(text, { language }).value
    return `<pre class="hljs"><code class="language-${escape(
      language,
    )}">${highlighted}</code></pre>`
  }
  marked.setOptions({ renderer })
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Render a markdown string to safe HTML. Server-only. */
export function renderMarkdown(source: string): string {
  registerLanguagesOnce()
  return marked.parse(source, { async: false }) as string
}
