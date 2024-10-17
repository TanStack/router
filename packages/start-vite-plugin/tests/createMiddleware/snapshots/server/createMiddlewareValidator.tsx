import { createMiddleware } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createMiddleware({
  id: 'test'
}).input(z.number()).use(({
  input
}) => input + 1);