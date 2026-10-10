/**
 * Styled route
 * @jsxImportSource @emotion/react
 */
// @refresh reset
import { icon } from 'jsx-pragmas.tsx?tsr-shared=1'
import { fetchTheme } from '../theme'
function StyledPage() {
  return <main css={{ color: 'hotpink' }}>{icon} styled</main>
}
const SplitLoader = async () => ({ icon, theme: await fetchTheme() })
export { SplitLoader as loader }
export { StyledPage as component }
