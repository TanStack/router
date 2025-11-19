import { createServerFn } from '@tanstack/react-start';
export const withUseServer = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withUseServer.__executeServer(opts, signal);
});
export const withArrowFunction = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withArrowFunction.__executeServer(opts, signal);
});
export const withArrowFunctionAndFunction = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withArrowFunctionAndFunction.__executeServer(opts, signal);
});
export const withoutUseServer = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withoutUseServer.__executeServer(opts, signal);
});
export const withVariable = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withVariable.__executeServer(opts, signal);
});
export const withZodValidator = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withZodValidator.__executeServer(opts, signal);
});
export const withValidatorFn = createServerFn({
  method: 'GET'
}).handler((opts, signal) => {
  "use server";

  return withValidatorFn.__executeServer(opts, signal);
});