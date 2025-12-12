import { type Dictionary, t } from 'intlayer';

const aboutContent = {
  key: 'about',
  content: {
    title: t({
      en: 'About Us',
      es: 'Sobre Nosotros',
      fr: 'À Propos',
    }),
    description: t({
      en: 'This is the about page using Intlayer for internationalization.',
      es: 'Esta es la página de información usando Intlayer para internacionalización.',
      fr: "Ceci est la page à propos utilisant Intlayer pour l'internationalisation.",
    }),
  },
} satisfies Dictionary;

export default aboutContent;
