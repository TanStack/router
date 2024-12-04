/** @type { import("eslint").Linter.Config[] } */
export default [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    ignores: ['./templates/barebones/template/'],
    parserOptions: {
      project: './tsconfig.eslint.json',
    },
  },
]
