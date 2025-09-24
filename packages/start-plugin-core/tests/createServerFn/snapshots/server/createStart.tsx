import { createStart } from '@tanstack/react-start';
import { foo } from '@some/lib';
export const startInstance = createStart(() => {});
export const someServerFn = startInstance.createServerFn().handler((opts, signal) => {
  "use server";

  return someServerFn.__executeServer(opts, signal);
}, () => {
  console.log('server mw');
  foo();
});