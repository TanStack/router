---
title: File-Based Routing API Reference
---

> [!IMPORTANT]
> Do not set the `routeFilePrefix`, `routeFileIgnorePrefix`, or `routeFileIgnorePattern` options, to match any of the tokens used in the [file-naming conventions](#file-naming-conventions) section.

- **`routeFilePrefix`**
  - (Optional) If set, only route files and directories that start with this string will be considered for routing.
- **`routeFileIgnorePrefix`**
  - (Optional, **Defaults to `-`**) Route files and directories that start with this string will be ignored. By default this is set to `-` to allow for the use of directories to house related files that do not contain any route files.
- **`routeFileIgnorePattern`**
  - (Optional) Ignore specific files and directories in the route directory. It can be used in regular expression format. For example, `.((css|const).ts)|test-page` will ignore files / directories with names containing `.css.ts`, `.const.ts` or `test-page`.
- **`indexToken`**
  - (Optional, **Defaults to `'index'`**) allows to customize the `index` Token [file naming convention](#file-naming-conventions).
- **`routeToken`**
  - (Optional, **Defaults to `'route'`**) allows to customize the `route` Token [file naming convention](#file-naming-conventions).
- **`routesDirectory`**
  - (Required) The directory containing the routes relative to the cwd.
- **`generatedRouteTree`**
  - (Required) The path to the file where the generated route tree will be saved, relative to the cwd.
- **`autoCodeSplitting`**

  - (Optional, **Defaults to `false`**)
  - If set to `true`, all non-critical route configuration items will be automatically code-split.
  - See the [using automatic code-splitting](./code-splitting.md#using-automatic-code-splitting) guide.

- **`quoteStyle`**
  - (Optional, **Defaults to `single`**) whether to use `single` or `double` quotes when formatting the generated files.
- **`semicolons`**
  - (Optional, **Defaults to `false`**) whether to use semicolons in the generated files.
- **`apiBase`**
  - (Optional) The base path for API routes. Defaults to `/api`.
  - This option is reserved for future use by the TanStack Start for API routes.
- **`disableTypes`**
  - (Optional, **Defaults to `false`**) whether to disable generating types for the route tree
  - If set to `true`, the generated route tree will not include any types.
  - If set to `true` and the `generatedRouteTree` file ends with `.ts` or `.tsx`, the generated route tree will be written as a `.js` file instead.
- **`addExtensions`**
  - (Optional, **Defaults to `false`**) add file extensions to the route names in the generated route tree
- **`disableLogging`**
  - (Optional, **Defaults to `false`**) disables logging for the route generation process
- **`routeTreeFileHeader`**

  - (Optional) An array of strings to prepend to the generated route tree file content.
  - Default:
  - ```
    [
      '/* eslint-disable */',
      '// @ts-nocheck',
      '// noinspection JSUnusedGlobalSymbols'
    ]
    ```

- **`routeTreeFileFooter`**
  - (Optional) An array of strings to append to the generated route tree file content.
  - Default: `[]`
- **`disableManifestGeneration`**
  - (Optional, **Defaults to `false`**) disables generating the route tree manifest
