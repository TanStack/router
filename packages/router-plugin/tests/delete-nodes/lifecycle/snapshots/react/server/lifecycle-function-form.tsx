import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from './posts'
const loader = () => fetchPosts()
export const Route = createFileRoute('/')({
  context: () => ({ value: 'context' }),
  beforeLoad: async () => ({ value: 'beforeLoad' }),
  loader,
  component: () => <div className="p-2">hello world</div>,
})
