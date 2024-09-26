import { createServerMiddleware } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerMiddleware({
  id: 'test'
}).use((...args) => {
  "use server";

  Object.assign(args[0].input, (z.number())(args[0].input));
  return (({
    input
  }) => input + 1)(...args);
});