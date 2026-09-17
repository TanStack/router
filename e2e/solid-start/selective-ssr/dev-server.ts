import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

export const devPort = await getTestServerPort(`${packageJson.name}-dev`)
export const devBaseURL = `http://localhost:${devPort}`
