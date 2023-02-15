import type { APIRoute } from 'astro'
import { createRequestHandler } from '../app/createRequestHandler'

export const all: APIRoute = createRequestHandler()
