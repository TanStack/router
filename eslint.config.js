// @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

import unusedImports from 'eslint-plugin-unused-imports'

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...tanstackConfig,
  {
    name: 'tanstack/temp',
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-shadow': 'off',
    },
  },
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
]

/**
 * For the source of the compiler packages (router-utils, router-plugin,
 * router-generator, start-plugin-core): no function literal assigned to a
 * property, `a.b = () => …` or an arrow function as a class property (the
 * build emits it as `this.b = () => …` in the constructor). V8 allocates such
 * a closure in old space. One created per compile is garbage that only a
 * major GC finds, and until then every scavenge treats it as a root:
 * everything its context reaches (a plan, its analysis, the parser's nodes)
 * is promoted to old space, for every module compiled. Use a method, or hand
 * over the data the function would read.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const compilerSourceConfig = [
  {
    name: 'tanstack/compiler-source',
    files: ['src/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "AssignmentExpression[left.type='MemberExpression'] > :matches(ArrowFunctionExpression, FunctionExpression).right",
          message:
            'V8 allocates a function literal assigned to a property in old space; created per compile, it promotes everything it reaches (see compilerSourceConfig in the root eslint.config.js). Use a method or pass the data instead.',
        },
        {
          selector:
            'PropertyDefinition > :matches(ArrowFunctionExpression, FunctionExpression).value',
          message:
            'A function-valued class property is built as a property assignment, which V8 allocates in old space (see compilerSourceConfig in the root eslint.config.js). Use a method instead.',
        },
      ],
    },
  },
]
