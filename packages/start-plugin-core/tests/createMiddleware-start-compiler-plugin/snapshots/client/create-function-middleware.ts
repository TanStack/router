import { createMiddleware } from '@tanstack/react-start';
import { foo } from '@some/lib';
export const fnMw = createMiddleware({
  type: 'function'
}).client(() => {
  console.log('client');
});