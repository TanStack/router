// DO NOT DELETE THIS FILE!!!
// This file is a good smoke test to make sure the custom server entry is working
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
import { createRouter } from './router'

console.log('[server-entry]: using custom server entry in src/server.ts')

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
