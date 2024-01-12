/// <reference types="vinxi/types/client" />
import * as React from 'react'
import 'vinxi/client'

import App from './app'
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'

const rootElement = document.getElementById('root')!

if (!rootElement.innerHTML) {
  const root = createRoot(rootElement)

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
