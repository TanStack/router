import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const FUNCTION_IDS: Record<string, Record<string, string>> = {
  'src/routes/submit-post-formdata.tsx': {
    greetUser_createServerFn_handler: 'submit-post-formdata-greetUser',
  },
  'src/routes/formdata-redirect/index.tsx': {
    greetUser_createServerFn_handler: 'formdata-redirect-greetUser',
  },
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      serverFns: {
        generateFunctionId: (opts) => {
          return FUNCTION_IDS[opts.filename]?.[opts.functionName]
        },
      },
    }),
    viteReact(),
  ],
})
