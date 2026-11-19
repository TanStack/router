import { render } from '@solidjs/web'
import App from './app'

const rootElement = document.getElementById('root')!

if (!rootElement.innerHTML) {
  render(() => <App />, rootElement)
}
