import type { RouterManagedTag } from './RouterManagedTag'

declare global {
  // eslint-disable-next-line no-var
  var MANIFEST: {
    client: {
      inputs: Record<string, {
          assets: () => Promise<
            Array<{
              tag: string
              attrs: Record<string, any>
              children: string
            }>
          >
        }>
      handler: string
    } | undefined
  }
}

export async function getManifestAssets(): Promise<Array<RouterManagedTag>> {
  const manifest = globalThis.MANIFEST['client']

  if (manifest) {
    return (
      ((await manifest.inputs[
        manifest.handler
      ]?.assets()) as Array<RouterManagedTag> | undefined) || []
    )
  }

  return []
}
