import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const image = await sharp(
  fileURLToPath(new URL('../artwork/notebook.svg', import.meta.url)),
)
  .png()
  .toBuffer()
for (const checkpoint of ['06-seo', '07-deployment', '08-tests']) {
  const directory = new URL(
    `../checkpoints/${checkpoint}/public/images/`,
    import.meta.url,
  )
  await mkdir(directory, { recursive: true })
  await writeFile(new URL('field-notes-v1.png', directory), image)
}
