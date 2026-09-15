export const hasServerRoutes = true

export const tsrStartManifest = () => ({
  clientEntry: '/assets/client.js',
  routes: {
    __root__: {},
    '/work': {
      preloads: ['/assets/work.js'],
      css: ['/assets/work.css'],
    },
  },
})
