import { lingui } from "@lingui/vite-plugin";
import { defineConfig } from '@tanstack/react-start/config'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  tsr: {
    appDirectory: 'src',
  },
  react: {
		babel: {
			plugins: ["@lingui/babel-plugin-lingui-macro"],
		},
	},
  vite: {
    plugins: [
      lingui(),
      tsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
})
