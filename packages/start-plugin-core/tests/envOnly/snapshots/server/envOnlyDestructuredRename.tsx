import { createServerOnlyFn as serverFn, createClientOnlyFn as clientFn } from '@tanstack/react-start';
const serverFunc = () => 'server';
const clientFunc = () => {
  throw new Error("createClientOnlyFn() functions can only be called on the client!");
};