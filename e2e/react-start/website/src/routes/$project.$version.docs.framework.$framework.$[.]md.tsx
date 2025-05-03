import { getDocument } from '~/server/document'

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params }) => {
    const splat = params['.md'] || ''
    const docPath = splat.split('.md')[0]

    if (!docPath) {
      return new Response('Document not found', { status: 404 })
    }

    const doc = await getDocument({ data: docPath })
    const markdown = `# ${doc.title}\n\n${doc.content}`

    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `inline; filename="${doc.title}.md"`,
      },
    })
  },
})
