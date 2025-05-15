// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom client entry is working
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createRouter } from './router'

console.log('[client-entry]: using custom client entry in src/client.tsx')

const router = createRouter()

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient router={router} />
    </StrictMode>,
  )
})
