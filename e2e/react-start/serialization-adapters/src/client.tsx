/// <reference types="vite/client" />
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import {
  getClientEntryNested,
  getClientEntryPing,
} from './client-entry-server-functions'

type ClientEntryServerFnResult =
  | {
      status: 'success'
      ping: string
      shout: string
      whisper: string
    }
  | {
      status: 'error'
      name: string
      message: string
    }

declare global {
  interface Window {
    __serializationAdapterClientEntryResult?: ClientEntryServerFnResult
  }
}

if (new URL(window.location.href).searchParams.has('client-entry-server-fn')) {
  void Promise.all([getClientEntryPing(), getClientEntryNested()])
    .then(([ping, nested]) => {
      window.__serializationAdapterClientEntryResult = {
        status: 'success',
        ping,
        shout: nested.inner.shout(),
        whisper: nested.whisper(),
      }
    })
    .catch((error) => {
      window.__serializationAdapterClientEntryResult = {
        status: 'error',
        name: error?.name ?? 'Error',
        message: error?.message ?? String(error),
      }
    })
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})
