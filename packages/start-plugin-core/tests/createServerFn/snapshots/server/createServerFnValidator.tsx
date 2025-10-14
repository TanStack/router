import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
}, ({
  input
}) => input + 1);