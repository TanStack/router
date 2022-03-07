---
id: custom-search-param-serialization
title: Custom Search Param Serialization
---

By default, React Location parses and serializes your search params automatically. Depending on your needs though, you may want to customize the serialization process.

To do so, you can [use `ReactLocation`'s `parseSearch` and `stringifySearch` options combined with the `parseSearchWith` and `stringifySearchWith` utilities](../docs/api#search-param-parsing-and-serialization).

For example: We can reimplement the default parser/serializer with the following code:

```tsx
import {
  ReactLocation,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-location'

const reactLocation = new ReactLocation({
  parseSearch: parseSearchWith(JSON.parse),
  stringifySearch: stringifySearchWith(JSON.stringify),
})
```

## Using Base64

It's common to base64 encode your search params to achieve maximum compatibility across browsers and URL unfurlers, etc. This can be done with the following code:

```tsx
import {
  ReactLocation,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-location'

const reactLocation = new ReactLocation({
  parseSearch: parseSearchWith((value) => JSON.parse(atob(value))),
  stringifySearch: stringifySearchWith((value) => btoa(JSON.stringify(value))),
})
```

## Using Zipson

[Zipson](https://jgranstrom.github.io/zipson/) is a very user-friendly and performant JSON compression library (both in runtime performance and the resulting compression performance). To compress your search params with it (which requires escaping/unescaping and base64 encoding/decoding them as well), you can use the following code:

```tsx
import {
  ReactLocation,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-location'
import { stringify, parse } from 'zipson'

const reactLocation = new ReactLocation({
  parseSearch: parseSearchWith((value) =>
    parse(decodeURIComponent(atob(value))),
  ),
  stringifySearch: stringifySearchWith((value) =>
    btoa(encodeURIComponent(stringify(value))),
  ),
})
```

## Using JSURL

[JSURL](https://github.com/Sage/jsurl) is a non-standard library that can both compress URLs while still maintaining readability. This can be done with the following code:

```tsx
import {
  ReactLocation,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-location'
import jsurl from 'jsurl'

const reactLocation = new ReactLocation({
  parseSearch: parseSearchWith(jsurl.parse),
  stringifySearch: stringifySearchWith(jsurl.stringify),
})
```
