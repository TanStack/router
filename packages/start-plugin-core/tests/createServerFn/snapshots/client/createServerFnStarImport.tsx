import * as TanStackStart from '@tanstack/react-start';
export const withUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
});
export const withoutUseServer = TanStackStart.createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withoutUseServer.__executeServer(opts);
});
export const withVariable = TanStackStart.createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withVariable.__executeServer(opts);
});
export const withZodValidator = TanStackStart.createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withZodValidator.__executeServer(opts);
});