import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import netlify from '@astrojs/netlify/functions'
import inspect from 'vite-plugin-inspect'
import bling from '@tanstack/bling/vite'
import type { AstroIntegration } from 'astro'
// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: netlify(),
  vite: {
    plugins: [bling(), inspect()],
  },
  integrations: [react(), tsr()],
})

function tsr() {
  return {
    name: '@tanstack/astro-plugin-ssr',
    hooks: {
      'astro:config:setup': async ({ updateConfig, injectRoute }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: '@tanstack/astro-plugin-ssr',
                enforce: 'post',
                options(opts) {
                  return addRollupInput(opts, ['src/entry-client.tsx'])
                },
              },
            ],
          },
        })
        injectRoute({
          entryPoint: 'src/entry-server.tsx',
          pattern: '/[...all]',
        })
      },
      'astro:build:ssr': async ({ manifest }) => {
        console.log(manifest)
      },
    },
  } as AstroIntegration
}

function fromEntries(entries) {
  const obj = {}
  for (const [k, v] of entries) {
    obj[k] = v
  }
  return obj
}

export function addRollupInput(inputOptions, newInputs) {
  // Add input module ids to existing input option, whether it's a string, array or object
  // this way you can use multiple html plugins all adding their own inputs
  if (!inputOptions.input) {
    return { ...inputOptions, input: newInputs }
  }

  if (typeof inputOptions.input === 'string') {
    return {
      ...inputOptions,
      input: [inputOptions.input, ...newInputs],
    }
  }

  if (Array.isArray(inputOptions.input)) {
    return {
      ...inputOptions,
      input: [...inputOptions.input, ...newInputs],
    }
  }

  if (typeof inputOptions.input === 'object') {
    return {
      ...inputOptions,
      input: {
        ...inputOptions.input,
        ...fromEntries(
          newInputs.map((i) => [i.split('/').slice(-1)[0].split('.')[0], i]),
        ),
      },
    }
  }

  throw new Error(
    `Unknown rollup input type. Supported inputs are string, array and object.`,
  )
}
