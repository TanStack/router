---
id: jsurl
title: React Location JSURL
---

A [JSURL](https://github.com/Sage/jsurl) powered stringifier/parser for React Location.

- Search param compression (smaller URLs)
- More legible search params (fewer JSON encodings)

## Usage

```tsx
import { ReactLocation } from 'react-location'
import { parseSearch, stringifySearch } from 'react-location-jsurl'

const reactLocation = new ReactLocation({
  parseSearch,
  stringifySearch,
})
```
