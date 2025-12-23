import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const withUseServer = createServerFn({
  method: 'GET'
}).inputValidator(z.number()).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withUseServer_createServerFn_handler"])));