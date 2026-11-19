import { render } from '@solidjs/web'
import App from './app'
import './styles.css'

const rootElement = document.getElementById('root')!

if (!rootElement.innerHTML) {
  render(() => <App />, rootElement)
}
