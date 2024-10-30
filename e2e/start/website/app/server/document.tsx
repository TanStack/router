import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

const documents: Array<{ id: string; title: string; content: string }> = [
  {
    id: 'overview',
    title: 'Overview',
    content: 'This is the content of the overview document',
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: 'To get started, you need to do the following...',
  },
  {
    id: 'installation',
    title: 'Installation',
    content: 'To install this package, run the following command...',
  },
  {
    id: 'ref/useQueryFunction',
    title: 'useQuery Reference',
    content: 'The useQuery function is used to...',
  },
  {
    id: 'ref/useMutationFunction',
    title: 'useMutation Reference',
    content: 'The useMutation function is used to...',
  },
]

export const getDocumentHeads = createServerFn('GET', async () => {
  await new Promise((resolve) => setTimeout(resolve, 200))

  return documents.map(({ id, title }) => ({
    id,
    title,
  }))
})

export const getDocument = createServerFn('GET', async (id: string) => {
  await new Promise((resolve) => setTimeout(resolve, 200))

  const document = documents.find((doc) => doc.id === id)

  if (!document) {
    throw notFound()
  }

  return document
})
