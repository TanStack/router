import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

// React 18 StrictMode causes setState functional updates
// to run twice. This example intentionally disables StrictMode
// so the counter increments only once when clicked.
//
// See: https://react.dev/reference/react/StrictMode

hydrateRoot(
  document,
  <StartClient />
) 