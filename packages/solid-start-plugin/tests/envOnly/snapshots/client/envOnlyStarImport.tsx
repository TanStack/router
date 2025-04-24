import * as TanstackStart from '@tanstack/solid-start';
const serverFunc = () => {
  throw new Error("serverOnly() functions can only be called on the server!");
};
const clientFunc = () => 'client';