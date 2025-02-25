import { createServerFn } from '@tanstack/solid-start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withUseServer.__executeServer(opts, signal);
});