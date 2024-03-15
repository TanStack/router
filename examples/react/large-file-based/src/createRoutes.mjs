import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const length = 200

const main = async () => {
  const absolute = (await readFile('./src/routes/absolute.tsx')).toString()
  const relative = (await readFile('./src/routes/relative.tsx')).toString()

  if (!existsSync('./src/routes/(gen)')) {
    await mkdir('./src/routes/(gen)')
  }

  for (let y = 0; y < length; y = y + 1) {
    const replacedAbsolute = absolute.replaceAll('/absolute', `/absolute${y}`)
    const replacedRelative = relative.replaceAll('/relative', `/relative${y}`)
    await writeFile(`./src/routes/(gen)/absolute${y}.tsx`, replacedAbsolute)
    await writeFile(`./src/routes/(gen)/relative${y}.tsx`, replacedRelative)
  }
}

main()
