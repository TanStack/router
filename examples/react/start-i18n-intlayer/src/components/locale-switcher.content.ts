import { type Dictionary, insert, t } from 'intlayer';

const localeSwitcherContent = {
  content: {
    languageListLabel: t({
      en: 'Language list',
      es: 'Lista de idiomas',
      fr: 'Liste de langues',
    }),
    localeSwitcherLabel: insert(t({
      en: 'Select language {{language}}',
      es: 'Seleccionar idioma {{language}}',
      fr: 'Sélectionner la langue {{language}}',
    })),
  },
  key: 'locale-switcher',
} satisfies Dictionary;

export default localeSwitcherContent;
