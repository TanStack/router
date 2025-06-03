import { createFileRoute } from '@tanstack/react-router'
import { styled } from 'styled-components'

const Layout = styled.div`
  padding: 1rem;
  border: 1px solid #e2e8f0; /* gray-200 */
  border-radius: 0.375rem; /* rounded */
  background-color: #f7fafc; /* gray-50 */
`

const Text = styled.p`
  font-size: 1.125rem; /* text-lg */
  color: #4a5568; /* gray-600 */
  @media (prefers-color-scheme: dark) {
    color: #a0aec0; /* dark:text-gray-400 */
  }
`

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <Layout>
      <Text>Hello from Tanstack Start with Styled Components!</Text>
    </Layout>
  )
}
