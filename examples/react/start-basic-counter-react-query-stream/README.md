# Example

To run this example in development:

- `pnpm i`
- `pnpm dev`

## What is this example?

This is a basic example of using Tanstack Start with React Query and SSE.
Server:
We will be using vinxi helpers and the EventEmitter from node:events to notify the SSE server when to send a new message to the client.

Client:
We will be leveraging fetchEventSource from @microsoft/fetch-event-source to make it easy to listen for SSE events.

## How it works

The EventEmitter will emit a ping event when the client sends a PUT request to the server.
When a client is connected to the GET /api/ping endpoint, a couple of things will happen:

- The client will now have a connection to the /api/ping endpoint.
- The server will listen to the EventEmitter for ping events, and will send a new message to the client every time there is an event.
- The client will receive any new messages from the server

When a client sends a PUT request to the /api/ping endpoint, the server will then both increment the counter, and emit a ping event using the EventEmitter.

When the client receives a message from the server, it will update the query cache with the newly received value.
