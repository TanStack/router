import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).validator(z.number()).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
}, ({
  input
}) => input + 1);