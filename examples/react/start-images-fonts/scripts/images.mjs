import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
await mkdir(new URL('../src/assets/', import.meta.url), { recursive: true })
for (const width of [480, 960, 1600]) {
  await sharp(fileURLToPath(new URL('../artwork/coast.svg', import.meta.url)))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(
      fileURLToPath(
        new URL(`../src/assets/coast-${width}.webp`, import.meta.url),
      ),
    )
}
