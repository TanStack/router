import {
  createRequestHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { createRouter } from './router'
import type express from 'express'

// index.js
import './fetch-polyfill'

export async function render(opts: {
  url: string
  head: string
  req: express.Request
  res: express.Response
}) {
  return createRequestHandler({
    createRouter,
    req: opts.req,
    res: opts.res,
  })(defaultStreamHandler)
}
