import { createStart } from '@tanstack/react-start';
export const startInstance = createStart(() => {});
export const someServerFn = startInstance.createServerFn().handler((opts, signal) => {
  "use server";

  return someServerFn.__executeServer(opts, signal);
});