/**
 * Styled route
 * @jsxImportSource @emotion/react
 */
// @refresh reset
import { icon } from 'jsx-pragmas.tsx?tsr-shared=1'
import { fetchTheme } from '../theme'
const SplitLoader = async () => ({ icon, theme: await fetchTheme() })
export { SplitLoader as loader }
