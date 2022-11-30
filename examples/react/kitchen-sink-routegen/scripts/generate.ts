import { generate } from './generator'

main()

async function main() {
  try {
    await generate()
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
