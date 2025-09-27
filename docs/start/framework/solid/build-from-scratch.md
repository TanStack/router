---
ref: docs/start/framework/react/build-from-scratch.md
replace:
  {
    '@tanstack/react-start': '@tanstack/solid-start',
    'react-router': 'solid-router',
    'react react-dom': 'solid-js',
    "Alternatively, you can also use `@vitejs/plugin-react-oxc` or `@vitejs/plugin-react-swc`.\n": '',
    '@vitejs/plugin-react': 'vite-plugin-solid',
    '@types/react @types/react-dom ': '',
    '"jsx": "react-jsx"': "\"jsx\": \"preserve\",\n    \"jsxImportSource\": \"solid-js\"",
    'import viteReact': 'import viteSolid',
    "viteReact\\(\\)": 'viteSolid({ssr:true})',
    "type { ReactNode } from 'react'": "type * as Solid from 'solid-js'",
    'ReactNode': 'Solid.JSX.Element',
    '{state}': '{state()}',
    "    <html>\n      <head>\n        <HeadContent />\n      </head>\n      <body>\n        {children}\n        <Scripts />\n      </body>\n    </html>": "    <>\n      <HeadContent />\n      {children}\n      <Scripts />\n    </>",
    "react's": "solid's",
    'React': 'SolidJS',
  }
---
