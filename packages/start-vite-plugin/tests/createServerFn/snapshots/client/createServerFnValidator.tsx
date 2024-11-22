import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
});