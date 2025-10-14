import { createServerFn as serverFn } from '@tanstack/react-start';
export const withUseServer = serverFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
});
export const withoutUseServer = serverFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withoutUseServer.__executeServer(opts);
});
export const withVariable = serverFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withVariable.__executeServer(opts);
});
export const withZodValidator = serverFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withZodValidator.__executeServer(opts);
});