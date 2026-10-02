import ReactDOM from 'react-dom'
import { shouldManageRscCss } from './shouldManageRscCss'

export function preinitCssHrefs(cssHrefs: Iterable<string> | undefined): void {
  if (!shouldManageRscCss()) {
    return
  }
  for (const href of cssHrefs ?? []) {
    ReactDOM.preinit(href, { as: 'style', precedence: 'high' })
  }
}
