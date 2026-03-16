import { createMiddleware } from '@tanstack/react-start';
export const clientOnly = createMiddleware({
  id: 'clientOnly',
  hasServer: false
}).client(async ({
  next
}) => {
  return next({
    context: {
      clientOnly: true
    }
  });
});
export const nestedClientOnly = createMiddleware({
  id: 'nestedClientOnly',
  hasServer: false
}).middleware([clientOnly]).client(async ({
  next
}) => {
  return next();
});