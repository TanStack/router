import bling from '@tanstack/bling/vite'

export function start() {
  return {
    name: '@tanstack/astro-plugin-ssr',
    hooks: {
      'astro:config:setup': async ({ updateConfig, injectRoute }) => {
        updateConfig({
          vite: {
            optimizeDeps: {
              exclude: ['@tanstack/react-start'],
            },
            plugins: [
              {
                name: '@tanstack/astro-plugin-ssr',
                enforce: 'post',
                options(opts) {
                  return addRollupInput(opts, ['src/entry-client.tsx'])
                },
              },
              bling(),
            ],
          },
        })
        injectRoute({
          entryPoint: 'src/entry-server.tsx',
          pattern: '/[...all]',
        })
      },

      'astro:build:ssr': async ({ manifest, ...args }) => {
        console.log(manifest)
      },
    },
  }
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
