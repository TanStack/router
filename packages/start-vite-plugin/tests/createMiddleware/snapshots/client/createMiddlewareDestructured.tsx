import { createMiddleware } from '@tanstack/start';
export const withUseServer = createMiddleware({
  id: 'test'
});
export const withoutUseServer = createMiddleware({
  id: 'test'
});
export const withVariable = createMiddleware({
  id: 'test'
});
export const withZodValidator = createMiddleware({
  id: 'test'
});