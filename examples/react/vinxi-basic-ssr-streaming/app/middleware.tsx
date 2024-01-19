import { defineMiddleware, getContext, setContext } from 'vinxi/server'

export default defineMiddleware({
  onRequest: (event) => {
    console.log(event.method, event.path)
    setContext(event, 'help', { foo: 'bar' })
  },
  onBeforeResponse: (event) => {
    console.log(getContext(event, 'help'))
  },
})
