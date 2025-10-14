#!/usr/bin/env node

import { e2eStartDummyServer } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

console.log('Starting dummy server...')
await e2eStartDummyServer(packageJson.name)
console.log('Dummy server started successfully!')

// Keep the process running non-interactively
process.stdin.pause()
