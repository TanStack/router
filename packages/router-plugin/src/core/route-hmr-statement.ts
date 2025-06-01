import * as template from '@babel/template'

export const routeHmrStatement = template.statement(
  `
if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule && newModule.Route && typeof newModule.Route.clone === 'function') {
      newModule.Route.clone(Route)
    }
   })
}
`,
)()
