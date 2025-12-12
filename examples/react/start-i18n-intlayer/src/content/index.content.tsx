import { type Dictionary, t } from 'intlayer';

const appContent = {
  key: 'app',
  content: {
    helloWorld: t({
      en: 'Hello World',
      es: 'Hola Mundo',
      fr: 'Bonjour le monde',
    }),
  },
} satisfies Dictionary;

export default appContent;
