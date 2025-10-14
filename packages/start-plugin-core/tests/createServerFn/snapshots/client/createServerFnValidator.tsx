import { createServerFn } from '@tanstack/react-start';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
});