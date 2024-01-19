export type Package = {
  name: string
  packageDir: string
  builds: Build[]
}

export type Build = {
  jsName: string
  entryFile: string
  external?: (d: string) => any
  globals?: Record<string, string>
  esm?: boolean
  cjs?: boolean
  umd?: boolean
  externals?: any[]
}

export type BranchConfig = {
  prerelease: boolean
  previousVersion?: boolean
}
