import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { SetupServerApi } from 'msw/node'
import { apiHandlers } from './src/api-handlers.ts'

// The apps only call the API with `fetch`, so only `fetch` is intercepted. MSW 2's
// default `http` interceptor replaces the global `Headers` and drops entries when
// one `Headers` is copied into another (mswjs/interceptors#850).
new SetupServerApi(apiHandlers, [new FetchInterceptor()]).listen({
  onUnhandledRequest: 'bypass',
})
