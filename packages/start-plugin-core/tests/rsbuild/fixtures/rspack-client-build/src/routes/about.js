// @ts-expect-error Rspack resolves resource queries in this fixture input.
import themeUrl from '../theme.css?url'
import { vendorB } from '../shared/vendor-b.js'

export const about = () => ({ themeUrl, vendorB })
