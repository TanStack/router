---
id: RouterTransformerType
title: RouterTransformer type
---

The `RouterTransformer` type represents the interface the router uses to transform data across network boundaries.

## RouterTransformer properties

The `RouterTransformer` type contains methods for stringifying and parsing data across network boundaries.

### `stringify` method

- Type: `(obj: unknown) => string`
- This method is called when stringifying data to be sent to the client.

### `parse` method

- Type: `(str: string) => unknown`
- This method is called when parsing the string encoded by the server.
