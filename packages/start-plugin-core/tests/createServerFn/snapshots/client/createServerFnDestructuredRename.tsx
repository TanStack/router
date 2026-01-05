import { createClientRpc } from '@tanstack/react-start/client-rpc';
import { createServerFn as serverFn } from '@tanstack/react-start';
export const withUseServer = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withoutUseServer = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhvdXRVc2VTZXJ2ZXJfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));
export const withVariable = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhWYXJpYWJsZV9jcmVhdGVTZXJ2ZXJGbl9oYW5kbGVyIn0"));
export const withZodValidator = serverFn({
  method: 'GET'
}).handler(createClientRpc("eyJmaWxlIjoiL0BpZC90ZXN0LnRzP3Rzcy1zZXJ2ZXJmbi1zcGxpdCIsImV4cG9ydCI6IndpdGhab2RWYWxpZGF0b3JfY3JlYXRlU2VydmVyRm5faGFuZGxlciJ9"));