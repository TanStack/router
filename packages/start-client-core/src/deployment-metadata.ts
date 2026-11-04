import type { RequestMetadataCarrier } from '@vitejs/deployment-metadata-types'

export type ResolvedDeploymentMetadata = {
  value: string
  carriers: ReadonlyArray<RequestMetadataCarrier>
}
