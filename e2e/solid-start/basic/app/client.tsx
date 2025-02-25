/// <reference types="vinxi/types/client" />
import { createRouter } from './router'
import { hydrate } from 'solid-js/web'
import { RouterProvider } from '@tanstack/solid-router'

const router = createRouter()

hydrate(() => <RouterProvider router={router} />, document)
