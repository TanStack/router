# @tanstack/create-start

CLI tool for creating and modifying TanStack Start projects.

```
pnpm create @tanstack/start
```

Run

```
pnpm create @tanstack/start --help
```

to see all options.

Until peer dependency issues are worked out, `npm create @tanstack/start` doesn't work.

Use pnpm or maybe a bundled version could be published instead.

# Contributing

## Modules

Modules represent templates and functionality that can be added later to a TanStack Start project. A module is created using a chain of methods specifying callbacks which receives arguments from the previous step.

- `createModule(schema)`: Set the schema of values that will be passed in from command line options.

- `.init((configFromSchema) => { ... })`: Crawl the filesystem to infer configuration, for example detecting the current package manager

- `.prompt((configFromInit) => { ... })`: Prompt the user for configuration, skipping config that has already been specified.

- `.validateAndApply({ validate, apply })`

  - `validate({ cfg, targetPath })`: check if preconditions met (is there a package.json? is a library already installed?) and return an array of strings that are issues to address

  - `apply({ cfg, targetPath })`: modify the filesystem: install libraries, modify files
