import { createServerOnlyFn, createClientOnlyFn } from '@tanstack/react-start';
const serverFunc = () => {
  throw new Error("createServerOnlyFn() functions can only be called on the server!");
};
const clientFunc = () => 'client';