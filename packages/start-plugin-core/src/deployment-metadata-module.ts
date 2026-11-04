import { createLogger } from './utils'
import type { RequestMetadata } from '@vitejs/deployment-metadata-types'
import type { ResolvedDeploymentMetadata } from '@tanstack/start-server-core'

export type RequestMetadataSource = Pick<RequestMetadata, 'value' | 'carriers'>

const SUPPORTED_CARRIER_TYPES = new Set<string>(['header', 'query'])

const logger = createLogger('deployment-metadata')

export function generateDeploymentMetadataModule(
  deploymentMetadata: ResolvedDeploymentMetadata | undefined,
): string {
  return `export const deploymentMetadata = ${
    deploymentMetadata ? JSON.stringify(deploymentMetadata) : 'null'
  }`
}

export async function resolveDeploymentMetadata(
  metadata: RequestMetadataSource,
): Promise<ResolvedDeploymentMetadata | undefined> {
  const value =
    typeof metadata.value === 'function'
      ? await metadata.value()
      : metadata.value

  const carriers = metadata.carriers.filter((carrier) =>
    SUPPORTED_CARRIER_TYPES.has(carrier.type),
  )

  if (!value) {
    logger.warn(
      'Deployment metadata has an empty value. Skew protection is disabled.',
    )

    return undefined
  }

  if (carriers.length === 0) {
    logger.warn(
      `Deployment metadata has no supported carriers (received: ${metadata.carriers.map((carrier) => carrier.type).join(', ')}; supported: header, query). Skew protection is disabled.`,
    )

    return undefined
  }

  return { value, carriers }
}
