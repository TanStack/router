import { type Dictionary, t } from 'intlayer';

interface HomePageContent {
  helloWorld: string;
  message: string;
  meta: {
    description: string;
    title: string;
  };
}

const appContent = {
  content: {
    helloWorld: t({
      en: 'Hello World',
      es: 'Hola mundo',
      fr: 'Bonjour le monde',
    }),
    message: t({
      en: 'Here is a multilingual message retrieved from the server side',
      es: 'Aquí tienes un mensaje multilingüe recuperado del lado del servidor',
      fr: 'Voici un message multilingue récupéré côté serveur',
    }),
    meta: {
      description: t({
        en: 'Here is a description',
        es: 'Aquí tienes una descripción',
        fr: 'Voici une description',
      }),

      title: t({
        en: 'Home page',
        es: 'Página de inicio',
        fr: 'Page d’accueil',
      }),
    },
  },
  key: 'app',
} satisfies Dictionary<HomePageContent>;

export default appContent;
