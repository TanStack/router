import { generator } from '@tanstack/router-generator'
import type { Config } from '@tanstack/router-generator'

export async function generate(config: Config) {
  try {
    await generator(config)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
