import { render } from '@solidjs/web'
import App from './app'

const rootEl = document.getElementById('root')

if (rootEl) {
  render(() => <App />, rootEl)
}
