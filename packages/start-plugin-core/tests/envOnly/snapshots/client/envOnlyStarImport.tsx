import * as TanstackStart from '@tanstack/react-start';
const serverFunc = () => {
  throw new Error("serverOnly() functions can only be called on the server!");
};
const clientFunc = () => 'client';