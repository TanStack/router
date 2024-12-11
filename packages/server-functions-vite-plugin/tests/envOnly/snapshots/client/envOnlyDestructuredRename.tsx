import { serverOnly as serverFn, clientOnly as clientFn } from '@tanstack/start';
const serverFunc = () => {
  throw new Error("serverOnly() functions can only be called on the server!");
};
const clientFunc = () => 'client';