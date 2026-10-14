// Shared by the Vite provider plugin, the Rsbuild option, the app and the
// tests, so every side agrees on what a correct request looks like.
export const DEPLOYMENT_ID = 'dpl_e2e_123'
export const HEADER_CARRIER = 'x-deployment-id'
export const MISSING = 'missing'

export const deploymentMetadata = {
  value: DEPLOYMENT_ID,
  carriers: [{ type: 'header', name: HEADER_CARRIER }],
} as const
