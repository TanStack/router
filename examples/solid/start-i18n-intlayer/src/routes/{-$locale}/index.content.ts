import { t, type Dictionary } from 'intlayer'

const indexContent = {
  key: 'index-page',
  content: {
    kicker: t({
      en: 'TanStack Start Base Template',
      fr: 'Modèle de base TanStack Start',
      es: 'Plantilla base TanStack Start',
    }),
    heroTitle: t({
      en: 'Start simple, ship quickly.',
      fr: 'Démarrez simplement, livrez rapidement.',
      es: 'Empieza simple, entrega rápido.',
    }),
    heroDesc: t({
      en: 'This base starter intentionally keeps things light: two routes, clean structure, and the essentials you need to build from scratch.',
      fr: "Ce modèle de démarrage reste volontairement simple : deux routes, une structure claire et l'essentiel pour construire depuis zéro.",
      es: 'Este starter base mantiene las cosas ligeras: dos rutas, estructura limpia y lo esencial para construir desde cero.',
    }),
    aboutLink: t({
      en: 'About This Starter',
      fr: 'À propos de ce modèle',
      es: 'Acerca de este starter',
    }),
    routerGuide: t({
      en: 'Router Guide',
      fr: 'Guide du routeur',
      es: 'Guía del router',
    }),
    features: {
      typeSafeRouting: {
        title: t({
          en: 'Type-Safe Routing',
          fr: 'Routage typé',
          es: 'Enrutamiento tipado',
        }),
        desc: t({
          en: 'Routes and links stay in sync across every page.',
          fr: 'Les routes et les liens restent synchronisés sur chaque page.',
          es: 'Las rutas y los enlaces se mantienen sincronizados en cada página.',
        }),
      },
      serverFunctions: {
        title: t({
          en: 'Server Functions',
          fr: 'Fonctions serveur',
          es: 'Funciones del servidor',
        }),
        desc: t({
          en: 'Call server code from your UI without creating API boilerplate.',
          fr: 'Appelez du code serveur depuis votre interface sans boilerplate API.',
          es: 'Llama código del servidor desde tu UI sin escribir código API repetitivo.',
        }),
      },
      streaming: {
        title: t({
          en: 'Streaming by Default',
          fr: 'Streaming par défaut',
          es: 'Streaming por defecto',
        }),
        desc: t({
          en: 'Ship progressively rendered responses for faster experiences.',
          fr: 'Envoyez des réponses progressives pour une expérience plus rapide.',
          es: 'Envía respuestas renderizadas progresivamente para experiencias más rápidas.',
        }),
      },
      tailwind: {
        title: t({
          en: 'Tailwind Native',
          fr: 'Tailwind intégré',
          es: 'Tailwind nativo',
        }),
        desc: t({
          en: 'Design quickly with utility-first styling and reusable tokens.',
          fr: 'Concevez rapidement avec des classes utilitaires et des tokens réutilisables.',
          es: 'Diseña rápido con clases utilitarias y tokens reutilizables.',
        }),
      },
    },
    quickStart: {
      kicker: t({
        en: 'Quick Start',
        fr: 'Démarrage rapide',
        es: 'Inicio rápido',
      }),
      editIndex: t({
        en: 'Edit src/routes/index.tsx to customize the home page.',
        fr: "Modifiez src/routes/index.tsx pour personnaliser la page d'accueil.",
        es: 'Edita src/routes/index.tsx para personalizar la página principal.',
      }),
      editHeader: t({
        en: 'Update src/components/Header.tsx for navigation and product links.',
        fr: 'Mettez à jour src/components/Header.tsx pour la navigation et les liens produit.',
        es: 'Actualiza src/components/Header.tsx para navegación y enlaces del producto.',
      }),
      editRoutes: t({
        en: 'Add routes in src/routes and tweak visual tokens in src/styles.css.',
        fr: 'Ajoutez des routes dans src/routes et ajustez les tokens visuels dans src/styles.css.',
        es: 'Añade rutas en src/routes y ajusta los tokens visuales en src/styles.css.',
      }),
    },
  },
} satisfies Dictionary

export default indexContent
