#!/usr/bin/env node

import { e2eStopDummyServer } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

console.log('Stopping dummy server...')
await e2eStopDummyServer(packageJson.name)
console.log('Dummy server stopped successfully!')