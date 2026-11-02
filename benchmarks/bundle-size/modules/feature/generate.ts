import { fileURLToPath } from 'node:url'
import { Generator, getConfig } from '@tanstack/router-generator'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * Generates and publishes the route module, like `tsr generate` in the
 * module's package: an application can only mount a generated module.
 */
export async function generateFeatureModule() {
  await new Generator({
    root,
    config: getConfig({ disableLogging: true, target: 'react' }, root),
  }).run()
}
