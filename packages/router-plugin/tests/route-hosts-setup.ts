/**
 * Vitest `setupFiles` entry: the page and shared hosts of `loadRoute` (`route-app.ts`)
 * close when the test file ends.
 */
import { afterAll } from 'vitest'
import { closeRouteHosts } from './route-app'

afterAll(closeRouteHosts)
