export const useExperimentalNonNestedPaths =
  typeof process !== 'undefined'
    ? typeof process.env.MODE !== 'undefined'
      ? process.env.MODE === 'nonnested'
      : process.env.VITE_MODE === 'nonnested'
    : import.meta.env.VITE_MODE === 'nonnested'
