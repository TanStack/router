import { notFound } from '@tanstack/react-router'
import type { ImageData } from '@responsive-image/core'

const thumbnails = import.meta.glob<{ default: ImageData }>(
  './images/gallery/*.jpg',
  {
    eager: true, // this is just generating image meta data, not need for lazy loading
    query: {
      w: '200;400',
      responsive: true, // opt into processing by @responsive-image/vite, see vite.config.ts. Without this, default vite asset handling applies.
    },
  },
)

const images = import.meta.glob<{ default: ImageData }>(
  './images/gallery/*.jpg',
  {
    eager: true, // this is just generating image meta data, not need for lazy loading
    query: {
      responsive: true, // opt into processing by @responsive-image/vite, see vite.config.ts. Without this, default vite asset handling applies.
    },
  },
)

export function getThumbsnails(): Record<string, ImageData> {
  return Object.fromEntries(
    Object.entries(thumbnails).map(([imageId, module]) => [
      normalizeImageId(imageId),
      module.default,
    ]),
  )
}

export function getImage(imageId: string): ImageData {
  const module = images[denormalizeImageId(imageId)]

  if (!module) {
    throw notFound({ data: { foo: 1 } })
  }

  return module.default
}

export function hasImage(imageId: string): boolean {
  return Boolean(images[denormalizeImageId(imageId)])
}

// Remove leading `./images/gallery/` from import.meta.glob keys for nicer URLs
function normalizeImageId(imageId: string): string {
  return imageId.replace(/^\.\/images\/gallery\//, '')
}

function denormalizeImageId(imageId: string): string {
  return `./images/gallery/${imageId}`
}
