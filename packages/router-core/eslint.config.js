// @ts-check

import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    // All URL-path string encoding/decoding must go through src/string-encoding.ts
    // so its guarantees (totality, sanitization, XSS safety) are enforced in one
    // reviewed place. See the trust-boundary documentation in that module.
    name: 'tanstack/router-core/string-encoding-boundary',
    files: ['src/**/*.ts'],
    ignores: ['src/string-encoding.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'encodeURIComponent',
          message: 'Use encodePathParam from ./string-encoding instead.',
        },
        {
          name: 'decodeURIComponent',
          message: 'Decoding must go through ./string-encoding helpers instead.',
        },
        {
          name: 'encodeURI',
          message: 'Use helpers from ./string-encoding instead.',
        },
        {
          name: 'decodeURI',
          message:
            'Decoding must go through decodePath/decodeSegment in ./string-encoding.',
        },
        {
          name: 'btoa',
          message:
            'Binary encoding belongs in ssr/serializer; ask before adding new uses.',
        },
        {
          name: 'atob',
          message:
            'Binary decoding belongs in ssr/serializer; ask before adding new uses.',
        },
      ],
    },
  },
  {
    // Exception to the rule above: in the matcher, throwing URIError from
    // decodeParam is the documented "malformed percent-encoding = no match"
    // contract. findMatch is the single choke point that converts it into a
    // null match; every public matching entry point funnels through it and
    // tests/string-encoding.property.test.ts asserts their totality.
    name: 'tanstack/router-core/matching-decode-contract',
    files: ['src/new-process-route-tree.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'encodeURIComponent',
          message: 'Use encodePathParam from ./string-encoding instead.',
        },
        {
          name: 'encodeURI',
          message: 'Use helpers from ./string-encoding instead.',
        },
        {
          name: 'decodeURI',
          message:
            'Decoding must go through decodePath/decodeSegment in ./string-encoding.',
        },
        {
          name: 'btoa',
          message:
            'Binary encoding belongs in ssr/serializer; ask before adding new uses.',
        },
        {
          name: 'atob',
          message:
            'Binary decoding belongs in ssr/serializer; ask before adding new uses.',
        },
      ],
    },
  },
  {
    // Base64 lives canonically in ssr/serializer (SSR stream serialization);
    // URL-path primitives live in string-encoding.ts.
    name: 'tanstack/router-core/binary-encoding-boundary',
    files: ['src/ssr/serializer/**/*.ts', 'src/string-encoding.ts'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
]
