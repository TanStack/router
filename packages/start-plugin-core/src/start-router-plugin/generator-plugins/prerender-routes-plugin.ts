import type { Generator, GeneratorPlugin } from '@tanstack/router-generator'

/**
 * this plugin gets the prerenderable paths and stores it on globalThis
 * so that it can be accessed later (e.g. from a vite plugin)
 */
export function prerenderRoutesPlugin(): GeneratorPlugin {
  let generator: Generator
  return {
    name: 'prerender-routes-plugin',
    init({ generator: instance }) {
      generator = instance
    },
    onRouteTreeChanged: () => {
      globalThis.TSS_PRERENDABLE_PATHS = [
        ...new Set(['/', ...generator.getPrerenderableRoutePaths()]),
      ].map((path) => ({ path }))
    },
  }
}
