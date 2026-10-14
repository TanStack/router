import { getViteDeploymentParticipants } from '@vitejs/deployment-metadata-helper'
import { createLogger } from '../utils'

// types
import type { UserConfig } from 'vite'
import type { RequestMetadata } from '@vitejs/deployment-metadata-types'
import type { ResolvedDeploymentMetadata } from '@tanstack/start-server-core'

type RequestMetadataSource = Pick<RequestMetadata, 'value' | 'carriers'>

const SUPPORTED_CARRIER_TYPES = new Set<string>(['header', 'query'])

const VDM0001_MAPPERS: Partial<
  Record<number, (metadata: RequestMetadata) => RequestMetadataSource>
> = {
  1: (metadata) => metadata,
  // future versions can be supported by
  // 2: (metadata) => unique version shim
}

export const SUPPORTED_VDM0001_VERSIONS =
  Object.keys(VDM0001_MAPPERS).map(Number)

const logger = createLogger('deployment-metadata')

export async function discoverRequestMetadata(
  config: UserConfig,
): Promise<RequestMetadataSource | undefined> {
  const unsupportedVersions: Array<string> = []

  for (const participant of await getViteDeploymentParticipants(config)) {
    for (const metadata of await participant.getMetadata()) {
      // guards for new specs, broken down by spec and spec versions
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (metadata.id === 'VDM0001') {
        const map = VDM0001_MAPPERS[metadata.version]
        if (map) {
          return map(metadata)
        }

        unsupportedVersions.push(
          `${participant.id} advertised VDM0001 v${metadata.version}`,
        )
      }
    }
  }

  if (unsupportedVersions.length > 0) {
    logger.warn(
      `${unsupportedVersions.join(', ')}; TanStack Start supports VDM0001 ${SUPPORTED_VDM0001_VERSIONS.map((version) => `v${version}`).join(', ')}. Skew protection is disabled.`,
    )
  }

  return undefined
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
