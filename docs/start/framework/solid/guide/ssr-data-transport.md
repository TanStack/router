---
ref: docs/start/framework/react/guide/ssr-data-transport.md
replace:
  {
    '@tanstack/react-start': '@tanstack/solid-start',
    '@tanstack/react-router': '@tanstack/solid-router',
    '/framework/react/': '/framework/solid/',
    'Route.useLoaderData():': 'Route.useLoaderData()():',
    '// In the component, `if (data.hydrated)` narrows to the second member and': '// In the component, read the accessor once (`const d = data()`): `if (d.hydrated)` narrows to the second member and',
    '// `data.prefs` is a `Prefs`; in the other branch `prefs` does not exist.': '// `d.prefs` is a `Prefs`; in the other branch `prefs` does not exist. Two separate `data()` calls do not narrow each other.',
  }
---
