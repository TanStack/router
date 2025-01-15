import { serverOnly, clientOnly } from '@tanstack/start';
const serverFunc = () => {
  throw new Error("serverOnly() functions can only be called on the server!");
};
const clientFunc = () => 'client';