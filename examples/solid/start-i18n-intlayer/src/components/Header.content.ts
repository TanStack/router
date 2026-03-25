import { t, type Dictionary } from 'intlayer'

const headerContent = {
  key: 'header',
  content: {
    tanstack: 'TanStack Start',
    intlayer: 'Intlayer',
    navHome: t({ en: 'Home', fr: 'Accueil', es: 'Inicio' }),
    navAbout: t({ en: 'About', fr: 'À propos', es: 'Acerca de' }),
    navDocs: t({ en: 'Docs', fr: 'Documentation', es: 'Documentación' }),
  },
} satisfies Dictionary

export default headerContent
