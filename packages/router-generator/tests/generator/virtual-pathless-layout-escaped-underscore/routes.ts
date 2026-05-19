import { layout, rootRoute, route } from '@tanstack/virtual-file-routes'

export const routes = rootRoute('__root.tsx', [
  route('/_foo', 'foo.tsx'),
  route('/[_]escaped', 'escaped.tsx'),
  route('/__double', 'double.tsx'),
  layout('_layout', 'layout.tsx', [
    route('/_bar', 'bar.tsx'),
    route('/[_]escaped-bar', 'escaped-bar.tsx'),
    route('/__double-bar', 'double-bar.tsx'),
    layout('_nested', 'nested-layout.tsx', [route('/_baz', 'baz.tsx')]),
  ]),
])
