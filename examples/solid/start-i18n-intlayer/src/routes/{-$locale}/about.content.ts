import { t, type Dictionary } from 'intlayer'

const aboutContent = {
  key: 'about-page',
  content: {
    kicker: t({ en: 'About', fr: 'À propos', es: 'Acerca de' }),
    title: t({
      en: 'A small starter with room to grow.',
      fr: 'Un modèle léger avec de la place pour grandir.',
      es: 'Un starter pequeño con espacio para crecer.',
    }),
    desc: t({
      en: 'TanStack Start gives you type-safe routing, server functions, and modern SSR defaults. Use this as a clean foundation, then layer in your own routes, styling, and add-ons.',
      fr: 'TanStack Start vous offre un routage typé, des fonctions serveur et des valeurs SSR modernes. Utilisez-le comme une base propre, puis ajoutez vos propres routes, styles et extensions.',
      es: 'TanStack Start te ofrece enrutamiento tipado, funciones del servidor y valores SSR modernos. Úsalo como una base limpia, luego agrega tus propias rutas, estilos y complementos.',
    }),
  },
} satisfies Dictionary

export default aboutContent
