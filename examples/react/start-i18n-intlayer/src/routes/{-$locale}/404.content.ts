import { type Dictionary, t } from 'intlayer';

const notFoundContent = {
  key: 'not-found',
  content: {
    title: t({
      en: 'Page Not Found',
      es: 'Página No Encontrada',
      fr: 'Page Non Trouvée',
    }),
    subtitle: t({
      en: "Oops! The page you're looking for doesn't exist.",
      es: '¡Ups! La página que buscas no existe.',
      fr: "Oups ! La page que vous recherchez n'existe pas.",
    }),
    backHome: t({
      en: 'Back to Home',
      es: 'Volver al Inicio',
      fr: "Retour à l'Accueil",
    }),
    lostMessage: t({
      en: "Looks like you've wandered into the void...",
      es: 'Parece que te has perdido en el vacío...',
      fr: 'On dirait que vous vous êtes égaré dans le vide...',
    }),
    meta: {
      title: t({
        en: 'Page Not Found',
        es: 'Página No Encontrada',
        fr: 'Page Non Trouvée',
      }),
      description: t({
        en: 'The page you are looking for does not exist.',
        es: 'La página que buscas no existe.',
        fr: "La page que vous recherchez n'existe pas.",
      }),
    },
  },
} satisfies Dictionary;

export default notFoundContent;
