import { createServerOnlyFn as serverFn, createClientOnlyFn as clientFn } from '@tanstack/react-start';
const serverFunc = () => {
  throw new Error("createServerOnlyFn() functions can only be called on the server!");
};
const clientFunc = () => 'client';