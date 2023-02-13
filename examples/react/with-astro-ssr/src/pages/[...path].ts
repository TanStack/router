import type { APIRoute } from 'astro'
import { createRequestHandler } from '../createRequestHandler'

export const all: APIRoute = createRequestHandler()
