import {
  build,
  copyPublicAssets,
  createNitro,
  prepare,
  prerender,
} from 'nitropack'

import type { NitroConfig } from 'nitropack'

export async function buildServer(nitroConfig: NitroConfig) {
  const nitro = await createNitro({
    dev: false,
    preset: process.env['BUILD_PRESET'],
    ...nitroConfig,
  })

  // if (nitroConfig.prerender?.postRenderingHooks) {
  //   addPostRenderingHooks(nitro, nitroConfig.prerender.postRenderingHooks)
  // }

  await prepare(nitro)
  await copyPublicAssets(nitro)

  if (
    nitroConfig.prerender?.routes &&
    nitroConfig.prerender.routes.length > 0
  ) {
    console.log(`Prerendering static pages...`)
    await prerender(nitro)
  }

  if (!nitroConfig.static) {
    console.log('Building Server...')
    await build(nitro)
  }

  await nitro.close()
}
