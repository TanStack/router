const common = {
  langs: {
    'zh-Hans': {
      code: 'zh-Hans',
      name: 'Simplified Chinese',
      // 翻译规则和指南
      guide: `
    - For technical terms that should not be fully translated, use the format: "中文翻译 (English term)"
      Example: "服务端渲染 (SSR)" instead of just "SSR" or just "服务端渲染"
    - Add a space between Chinese characters and English words/symbols to improve readability
    - Maintain consistent translations for common terms across the entire document
`,
      // 常见技术术语翻译词典
      // 格式: 'English term': '中文翻译'
      terms: {},
    },
    //     'zh-Hant': {
    //       code: 'zh-Hant',
    //       name: 'Traditional Chinese',
    //       // 翻譯規則和指南
    //       guide: `
    //     - For technical terms that should not be fully translated, use the format: "繁體中文翻譯 (English term)"
    //       Example: "伺服器渲染 (SSR)" instead of just "SSR" or just "伺服器渲染"
    //     - Add a space between Chinese characters and English words/symbols to improve readability
    //     - Maintain consistent translations for common terms across the entire document
    // `,
    //       // 常見技術術語翻譯詞典
    //       // 格式: 'English term': '繁體中文翻譯'
    //       terms: {},
    //     },
    //     ja: {
    //       code: 'ja',
    //       name: 'Japanese',
    //       guide: `
    //     - For technical terms that should not be fully translated, use the format: "日本語訳 (English term)"
    //       Example: "サーバーサイドレンダリング (SSR)" instead of just "SSR" or just "サーバーサイドレンダリング"
    //     - Maintain consistent translations for common terms across the entire document
    //     - Use katakana for foreign technical terms where appropriate
    // `,
    //       terms: {},
    //     },
    //     es: {
    //       code: 'es',
    //       name: 'Spanish',
    //       guide: `
    //     - For technical terms that should not be fully translated, use the format: "Traducción en español (English term)"
    //       Example: "Renderizado del lado del servidor (SSR)" instead of just "SSR" or just "Renderizado del lado del servidor"
    //     - Maintain consistent translations for common terms across the entire document
    //     - Use formal "usted" form instead of informal "tú" for instructions
    // `,
    //       terms: {},
    //     },
    //     de: {
    //       code: 'de',
    //       name: 'German',
    //       guide: `
    //     - For technical terms that should not be fully translated, use the format: "Deutsche Übersetzung (English term)"
    //       Example: "Server-seitiges Rendering (SSR)" instead of just "SSR" or just "Server-seitiges Rendering"
    //     - Maintain consistent translations for common terms across the entire document
    //     - Follow German capitalization rules for nouns
    // `,
    //       terms: {},
    //     },
    //     fr: {
    //       code: 'fr',
    //       name: 'French',
    //       guide: `
    //     - For technical terms that should not be fully translated, use the format: "Traduction française (English term)"
    //       Example: "Rendu côté serveur (SSR)" instead of just "SSR" or just "Rendu côté serveur"
    //     - Maintain consistent translations for common terms across the entire document
    //     - Use proper French punctuation with spaces before certain punctuation marks
    // `,
    //       terms: {},
    //     },
    //     ru: {
    //       code: 'ru',
    //       name: 'Russian',
    //       guide: `
    //     - For technical terms that should not be fully translated, use the format: "Русский перевод (English term)"
    //       Example: "Рендеринг на стороне сервера (SSR)" instead of just "SSR" or just "Рендеринг на стороне сервера"
    //     - Maintain consistent translations for common terms across the entire document
    //     - Use proper Russian cases for technical terms where appropriate
    // `,
    //       terms: {},
    //     },
    //     ar: {
    //       code: 'ar',
    //       name: 'Arabic',
    //       guide: `
    //     - For technical terms that should not be fully translated, use the format: "الترجمة العربية (English term)"
    //       Example: "العرض من جانب الخادم (SSR)" instead of just "SSR" or just "العرض من جانب الخادم"
    //     - Maintain consistent translations for common terms across the entire document
    //     - Arabic text should flow right-to-left, but keep code examples and technical terms left-to-right
    // `,
    //       terms: {},
    //     },
  },
}

export default [
  // Router
  {
    ...common,
    docsRoot: 'docs/router',
    docsContext: `**TanStack Router is a router for building React and Solid applications**. Some of its features include:
- 100% inferred TypeScript support
- Typesafe navigation
- Nested Routing and layout routes (with pathless layouts)
- Built-in Route Loaders w/ SWR Caching
- Designed for client-side data caches (TanStack Query, SWR, etc.)
- Automatic route prefetching
- Asynchronous route elements and error boundaries
- File-based Route Generation
- Typesafe JSON-first Search Params state management APIs
- Path and Search Parameter Schema Validation
- Search Param Navigation APIs
- Custom Search Param parser/serializer support
- Search param middleware
- Route matching/loading middleware`,
    copyPath: [
      'framework/solid/**',
      // guide
      '!framework/solid/guide/custom-link',
      '!framework/solid/guide/scroll-restoration',
      //  routing
      '!framework/solid/routing/file-based-routing',
      '!framework/solid/routing/installation-with-router-cli',
      '!framework/solid/routing/installation-with-vite',
      //
      '!framework/solid/quick-start',
    ],
  },
  // Start
  {
    ...common,
    docsRoot: 'docs/start',
    docsContext: `TanStack Start is a full-stack React framework powered by TanStack Router. It provides a full-document SSR, streaming, server functions, bundling, and more using tools like [Nitro](https://nitro.unjs.io/) and [Vite](https://vitejs.dev/). It is ready to deploy to your favorite hosting provider!

## Router or Start?

TanStack Router is a powerful, type-safe, and full-featured routing system for React applications. It is designed to handle the beefiest of full-stack routing requirements with ease. TanStack Start builds on top of Router's type system to provide type-safe full-stack APIs that keep you in the fast lane.

What you get with TanStack Router:

- 100% inferred TypeScript support
- Typesafe navigation
- Nested Routing and pathless layout routes
- Built-in Route Loaders w/ SWR Caching
- Designed for client-side data caches (TanStack Query, SWR, etc.)
- Automatic route prefetching
- Asynchronous route elements and error boundaries
- File-based Route Generation
- Typesafe JSON-first Search Params state management APIs
- Path and Search Parameter Schema Validation
- Search Param Navigation APIs
- Custom Search Param parser/serializer support
- Search param middleware
- Route matching/loading middleware

What you get with TanStack Start:

- Full-document SSR
- Streaming
- Server Functions / RPCs
- Bundling
- Deployment
- Full-Stack Type Safety

**In summary, use TanStack Router for client-side routing and TanStack Start for full-stack routing.**`,
    copyPath: [
      'framework/solid/**',
      '!framework/solid/authentication',
      '!framework/solid/build-from-scratch',
      '!framework/solid/hosting',
      '!framework/solid/learn-the-basics',
      '!framework/solid/overview',
      '!framework/solid/quick-start',
      '!framework/solid/server-functions',
    ],
  },
]
