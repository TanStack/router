import { createServerFn as serverFn } from '@tanstack/react-start';
export const withUseServer = serverFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withUseServer.__executeServer(opts, signal);
});
export const withoutUseServer = serverFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withoutUseServer.__executeServer(opts, signal);
});
export const withVariable = serverFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withVariable.__executeServer(opts, signal);
});
export const withZodValidator = serverFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withZodValidator.__executeServer(opts, signal);
});