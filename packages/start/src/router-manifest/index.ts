// @ts-expect-error
// eslint-disable-next-line import/no-unresolved
import tsrGetManifest from 'tsr:routes-manifest'
import type { Manifest } from '@tanstack/react-router'

export function getRouterManifest() {
  return tsrGetManifest() as Manifest
}
