import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const FUNCTIONS_WITH_CONSTANT_ID = [
  'src/routes/submit-post-formdata.tsx/greetUser_createServerFn_handler',
  'src/routes/formdata-redirect/index.tsx/greetUser_createServerFn_handler',
]

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      serverFns: {
        generateFunctionId: (opts) => {
          const id = `${opts.filename}/${opts.functionName}`
          if (FUNCTIONS_WITH_CONSTANT_ID.includes(id)) return 'constant_id'
          else return undefined
        },
      },
    }),
    viteReact(),
  ],
})
