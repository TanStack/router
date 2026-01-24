import { type Dictionary, t } from 'intlayer'

const appContent = {
  content: {
    helloWorld: t({
      en: 'Hello World',
      es: 'Hola Mundo',
      fr: 'Bonjour le monde',
    }),
  },
  key: 'app',
} satisfies Dictionary

export default appContent
