import * as TanStackStart from '@tanstack/start';
export const withUseServer = TanStackStart.createMiddleware({
  id: 'test'
});
export const withoutUseServer = TanStackStart.createMiddleware({
  id: 'test'
});
export const withVariable = TanStackStart.createMiddleware({
  id: 'test'
});
export const withZodValidator = TanStackStart.createMiddleware({
  id: 'test'
});