import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler((opts, signal) => {
  "use server";

  return withUseServer.__executeServer(opts, signal);
}, ({
  input
}) => input + 1);