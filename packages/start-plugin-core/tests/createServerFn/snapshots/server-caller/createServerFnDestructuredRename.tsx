import { createSsrRpc } from '@tanstack/react-start/ssr-rpc';
import { createServerFn as serverFn } from '@tanstack/react-start';
export const withUseServer = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withUseServer_createServerFn_handler"])));
export const withoutUseServer = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhvdXRVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withoutUseServer_createServerFn_handler"])));
export const withVariable = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhWYXJpYWJsZV9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0", () => import("test.ts?tss-serverfn-split").then(m => m["withVariable_createServerFn_handler"])));
export const withZodValidator = serverFn({
  method: 'GET'
}).handler(createSsrRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhab2RWYWxpZGF0b3JfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9", () => import("test.ts?tss-serverfn-split").then(m => m["withZodValidator_createServerFn_handler"])));