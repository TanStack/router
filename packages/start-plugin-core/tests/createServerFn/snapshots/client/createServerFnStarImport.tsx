import * as TanStackStart from '@tanstack/react-start';
export const withUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withUseServer.__executeServer(opts, signal);
});
export const withoutUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withoutUseServer.__executeServer(opts, signal);
});
export const withVariable = TanStackStart.createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withVariable.__executeServer(opts, signal);
});
export const withZodValidator = TanStackStart.createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withZodValidator.__executeServer(opts, signal);
});