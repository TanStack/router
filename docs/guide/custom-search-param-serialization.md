---
title: Custom Search Param Serialization
---

> TODO This portion of documentation is currently under construction

By default, TanStack Router parses and serializes your search params automatically. Depending on your needs though, you may want to customize the serialization process.

To do so, [use `Router`'s `parseSearch` and `stringifySearch` options](../docs/api#search-param-parsing-and-serialization):

```tsx
  import {
    Router,
    parseSearchWith,
    stringifySearchWith,
  } from '@tanstack/react-router';
  import qs from 'query-string';

  // For example, we use `query-string` to render arrays in bracket notation:
  // output: ?key[]=value1&key[]=value2

  function customStringifier(searchObj) {
    return qs.stringify(searchObj, { arrayFormat: 'bracket' });
  }

  function customParser(searchString) {
    return qs.parse(searchString, { arrayFormat: 'bracket' });
  }

  const router = new Router({
    stringifySearch: customStringifier,
    parseSearch: customParser,
  })
```

Additionally, you can [use the `parseSearchWith` and `stringifySearchWith` utilities](../docs/api#search-param-parsing-and-serialization) to parse and serialize the search values specifically.

For example, we can reimplement the default parser/serializer with the following code:

```tsx
import {
  Router,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'

const router = new Router({
  parseSearch: parseSearchWith(JSON.parse),
  stringifySearch: stringifySearchWith(JSON.stringify),
})
```

## Using Base64

It's common to base64 encode your search params to achieve maximum compatibility across browsers and URL unfurlers, etc. This can be done with the following code:

```tsx
import {
  Router,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'

const router = new Router({
  parseSearch: parseSearchWith((value) => JSON.parse(decodeFromBinary(value))),
  stringifySearch: stringifySearchWith((value) =>
    encodeToBinary(JSON.stringify(value)),
  ),
})

export function decodeFromBinary(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join(''),
  )
}
export function encodeToBinary(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode(parseInt(p1, 16))
    }),
  )
}
```

> [⚠️ Why does this snippet not use atob/btoa?](#safe-binary-encodingdecoding)

## Using Zipson

[Zipson](https://jgranstrom.github.io/zipson/) is a very user-friendly and performant JSON compression library (both in runtime performance and the resulting compression performance). To compress your search params with it (which requires escaping/unescaping and base64 encoding/decoding them as well), you can use the following code:

```tsx
import {
  Router,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'
import { stringify, parse } from 'zipson'

const router = new Router({
  parseSearch: parseSearchWith((value) =>
    parse(decodeURIComponent(decodeFromBinary(value))),
  ),
  stringifySearch: stringifySearchWith((value) =>
    encodeToBinary(encodeURIComponent(stringify(value))),
  ),
})

export function decodeFromBinary(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join(''),
  )
}
export function encodeToBinary(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode(parseInt(p1, 16))
    }),
  )
}
```

> [⚠️ Why does this snippet not use atob/btoa?](#safe-binary-encodingdecoding)

## Using JSURL2

[JSURL2](https://github.com/wmertens/jsurl2) is a non-standard library that can both compress URLs while still maintaining readability. This can be done with the following code:

```tsx
import {
  Router,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'
import jsurl from 'jsurl2'

const router = new Router({
  parseSearch: parseSearchWith(jsurl.parse),
  stringifySearch: stringifySearchWith(jsurl.stringify),
})
```

<hr></hr>

### Safe Binary Encoding/Decoding

In the browser, `atob` and `btoa` are not guaranteed to work properly with non-UTF8 characters. We recommend using these encoding/decoding utilities instead:

To encode from a string to a binary string:

```typescript
export function encodeToBinary(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode(parseInt(p1, 16))
    }),
  )
}
```

To decode from a binary string to a string:

```typescript
export function decodeFromBinary(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join(''),
  )
}
```
