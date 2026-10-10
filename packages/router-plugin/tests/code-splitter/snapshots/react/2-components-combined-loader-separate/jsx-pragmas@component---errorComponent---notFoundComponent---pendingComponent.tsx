/**
 * Styled route
 * @jsxImportSource @emotion/react
 */
// @refresh reset
import { icon } from 'jsx-pragmas.tsx?tsr-shared=1'
function StyledPage() {
  return <main css={{ color: 'hotpink' }}>{icon} styled</main>
}
export { StyledPage as component }
const SplitErrorComponent = () => <p css={{ color: 'red' }}>{icon} error</p>
export { SplitErrorComponent as errorComponent }
