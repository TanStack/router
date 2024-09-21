import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET',
  serverValidator: () => {
    "use server";

    return z.number();
  },
  fn: num => {
    "use server";

    return num + 1;
  }
});