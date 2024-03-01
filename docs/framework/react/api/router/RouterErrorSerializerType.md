---
id: RouterErrorSerializerType
title: RouterErrorSerializer type
---

The `RouterErrorSerializer` type represents the interface the router uses to serialize and deserialize errors.

## RouterErrorSerializer properties

The `RouterErrorSerializer` type contains methods for serializing and deserializing errors.

### `serialize` method

- Type: `(err: unknown) => TSerializedError`
- This method is called to define how errors are serialized when they are stored in the router's dehydrated state.

### `deserialize` method

- Type: `(err: TSerializedError) => unknown`
- This method is called to define how errors are deserialized from the router's dehydrated state.
