import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/solid-start/server'
import { createRouter } from './router'

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
