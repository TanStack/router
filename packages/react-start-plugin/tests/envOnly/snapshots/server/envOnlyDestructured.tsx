import { serverOnly, clientOnly } from '@tanstack/react-start';
const serverFunc = () => 'server';
const clientFunc = () => {
  throw new Error("clientOnly() functions can only be called on the client!");
};