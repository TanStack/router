import { createServerFn } from '@tanstack/start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET' }).handler( (...args) => {
    "use server";

    args[0].payload = (z.number())(args[0].payload);
    return (({
      payload
    }) => {
      return payload + 1;
    })(...args);
  }
});