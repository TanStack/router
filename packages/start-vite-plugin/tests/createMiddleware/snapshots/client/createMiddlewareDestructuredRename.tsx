import { createMiddleware as middlewareFn } from '@tanstack/start';
export const withUseServer = middlewareFn({
  id: 'test'
});
export const withoutUseServer = middlewareFn({
  id: 'test'
});
export const withVariable = middlewareFn({
  id: 'test'
});
export const withZodValidator = middlewareFn({
  id: 'test'
});