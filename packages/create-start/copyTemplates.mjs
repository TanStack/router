import fs from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'
import url from 'node:url'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function copyTemplates() {
  const templates = await fg('**/template/**', {
    cwd: path.join(__dirname, 'src'),
    onlyFiles: false,
  })

  for (const template of templates) {
    const src = path.join(__dirname, 'src', template)
    const dest = path.join(__dirname, 'dist', template)

    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.cp(src, dest, { recursive: true })
  }
}

copyTemplates().catch(console.error)
