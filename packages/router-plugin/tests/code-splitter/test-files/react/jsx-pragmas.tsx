/**
 * Styled route
 * @jsxImportSource @emotion/react
 */
// @refresh reset
import { createFileRoute } from '@tanstack/react-router'
import { fetchTheme } from '../theme'

const icon = <svg css={{ width: 16 }} />

export const Route = createFileRoute('/styled')({
  loader: async () => ({ icon, theme: await fetchTheme() }),
  component: StyledPage,
  errorComponent: () => <p css={{ color: 'red' }}>{icon} error</p>,
})

function StyledPage() {
  return <main css={{ color: 'hotpink' }}>{icon} styled</main>
}
