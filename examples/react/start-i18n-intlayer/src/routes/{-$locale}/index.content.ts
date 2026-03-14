import { type Dictionary, t } from 'intlayer'

const appContent = {
  content: {
    helloWorld: t({
      en: 'Hello World',
      es: 'Hola Mundo',
      fr: 'Bonjour le monde',
    }),
    meta: {
      title: t({
        en: 'Hello world page',
        es: 'Página de Hola Mundo',
        fr: 'Page Bonjour le monde',
      }),
      description: t({
        en: 'Hello world page description',
        es: 'Descripción de la página de Hola Mundo',
        fr: 'Description de la page Bonjour le monde',
      }),
    },
    message: t({
      en: 'Message fetched from the server side',
      es: 'Mensaje obtenido del servidor',
      fr: 'Message récupéré du côté serveur',
    }),
  },
  key: 'app',
} satisfies Dictionary

export default appContent
