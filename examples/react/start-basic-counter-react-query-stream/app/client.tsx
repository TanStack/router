import { StartClient } from '@tanstack/start'
import { hydrateRoot } from 'react-dom/client'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(
  document.getElementById('root') as HTMLElement,
  <StartClient router={router} />,
)
