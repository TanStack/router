import { getViteDeploymentParticipants } from '@vitejs/deployment-metadata-helper'
import { createLogger } from '../utils'

// types
import type { UserConfig } from 'vite'
import type { RequestMetadata } from '@vitejs/deployment-metadata-types'
import type { ResolvedDeploymentMetadata } from '@tanstack/start-server-core'
import type { RequestMetadataSource } from '../deployment-metadata-module'

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

export function createDeploymentRenderBuiltUrl(opts: {
  deploymentMetadata: ResolvedDeploymentMetadata
  publicBase: string
  hasUserRenderBuiltUrl: boolean
}): ((filename: string) => string) | undefined {
  const queryCarrier = opts.deploymentMetadata.carriers.find(
    (carrier) => carrier.type === 'query',
  )

  if (!queryCarrier) {
    return undefined
  }

  if (opts.hasUserRenderBuiltUrl) {
    logger.warn(
      'experimental.renderBuiltUrl is already configured, so built asset urls are not tagged with the deployment id. Skew protection for assets is disabled.',
    )

    return undefined
  }

  const base = opts.publicBase.endsWith('/')
    ? opts.publicBase
    : `${opts.publicBase}/`
  const query = `${encodeURIComponent(queryCarrier.name)}=${encodeURIComponent(opts.deploymentMetadata.value)}`

  return (filename) => `${base}${filename}?${query}`
}
