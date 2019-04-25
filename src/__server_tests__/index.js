import React from 'react'
import ReactDOMServer from 'react-dom/server'
import loadable from 'react-loadable'
import App from '../app'

test('can render to static markup', async () => {
  await loadable.preloadAll()
  ReactDOMServer.renderToString(<App />)
})
