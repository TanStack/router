export const DEPLOYMENT_ID = 'dpl_e2e_123'
export const HEADER_CARRIER = 'x-deployment-id'
export const QUERY_CARRIER = 'dpl'

export const MISSING = 'missing'

export const deploymentMetadata = {
  value: DEPLOYMENT_ID,
  carriers: [
    { type: 'header', name: HEADER_CARRIER },
    { type: 'query', name: QUERY_CARRIER },
  ],
} as const
