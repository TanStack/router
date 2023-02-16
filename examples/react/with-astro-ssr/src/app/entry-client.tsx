import { server$ } from '@tanstack/bling/server'
import { LoaderInstance } from '@tanstack/react-loaders'
import ReactDOM from 'react-dom/client'

server$.addSerializer({
  apply: (e) => e instanceof LoaderInstance,
  serialize: (e) => ({ $type: 'loaderClient' }),
})

import { App } from './App'

ReactDOM.hydrateRoot(document, <App />)
