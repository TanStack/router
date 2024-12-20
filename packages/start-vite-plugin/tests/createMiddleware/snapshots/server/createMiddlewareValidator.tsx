import { createMiddleware } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createMiddleware({
  id: 'test'
}).validator(z.number()).server(({
  input
}) => input + 1);