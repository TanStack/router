// research stub: the router planner never reads the generator config
import { z } from 'zod'
export const configSchema = z.object({}).passthrough()
export function getConfig(c: unknown) {
  return c
}
