import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createStart } from '#tanstack-start-createStart-entry'

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient createStart={createStart} />
    </StrictMode>,
  )
})
