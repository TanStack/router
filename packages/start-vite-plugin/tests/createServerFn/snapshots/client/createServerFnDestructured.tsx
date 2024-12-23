import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withUseServer.__executeServer(opts);
});
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withArrowFunction.__executeServer(opts);
});
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withArrowFunctionAndFunction.__executeServer(opts);
});
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withoutUseServer.__executeServer(opts);
});
export const withVariable = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withVariable.__executeServer(opts);
});
function zodValidator<TSchema extends z.ZodSchema, TResult>(schema: TSchema, fn: (input: z.output<TSchema>) => TResult) {
  return async (input: unknown) => {
    return fn(schema.parse(input));
  };
}
export const withZodValidator = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withZodValidator.__executeServer(opts);
});
export const withValidatorFn = createServerFn({
  method: 'GET'
}).handler(opts => {
  "use server";

  return withValidatorFn.__executeServer(opts);
});