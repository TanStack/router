import { generator } from '@tanstack/router-generator'
import type { Config } from '@tanstack/router-generator'

export async function generate(config: Config, root: string) {
  try {
    await generator(config, root)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
