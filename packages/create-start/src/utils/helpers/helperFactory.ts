export type Ctx = {
  getFullModulePath: (relativePath: string) => string
  getFullTargetPath: (relativePath: string) => string
  targetFileExists: (relativePath: string) => Promise<boolean>
  moduleFileExists: (relativePath: string) => Promise<boolean>
  absoluteTargetFolder: string
  absoluteModuleFolder: string
}

type HelperFn<T extends (...args: any) => any> = (args: {
  modulePath: string
  targetPath: string
  ctx: Ctx
}) => T

export const helperFactory = <T extends (...args: any) => any>(
  fn: HelperFn<T>,
) => {
  return fn
}
