import { Locales } from 'intlayer'
import type { IntlayerConfig } from 'intlayer'

const config: IntlayerConfig = {
  build: {
    importMode: 'dynamic',
  },
  routing: {
    mode: 'prefix-no-default',
  },
  log: {
    mode: 'verbose',
  },
  ai: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    apiKey: process.env.OPENAI_API_KEY,
    applicationContext: 'This is a test application',
  },
  editor: {
    applicationURL: 'http://localhost:3000',
  },
  internationalization: {
    defaultLocale: Locales.ENGLISH,
    locales: [
      Locales.ENGLISH,
      Locales.FRENCH,
      Locales.SPANISH,
      // Your other locales
    ],
    requiredLocales: [
      // Can be different from locale list for TypeScript errors
      Locales.ENGLISH,
      Locales.FRENCH,
    ],
    strictMode: 'inclusive', // Avoid errors when more locales are included
  },
  // Can customize dictionary global behavior
  // dictionary: {
  //   locale: Locales.ENGLISH,
  //   fill: true,
  // },
  // Can enable the compiler
  // compiler: {
  //   enabled: true,
  // },
}

export default config
