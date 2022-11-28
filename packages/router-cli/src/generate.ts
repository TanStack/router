import { generator } from './generator'
import { Config } from './config'

export async function generate(config: Config) {
  try {
    await generator(config)
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
