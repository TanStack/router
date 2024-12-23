import { createModule } from './module'
import { ideModule as unstable_ideModule } from './modules/ide'
import { gitModule as unstable_gitModule } from './modules/git'
import { coreModule as unstable_coreModule } from './modules/core'
import { packageJsonModule as unstable_packageJsonModule } from './modules/packageJson'
import { packageManagerModule as unstable_packageManagerModule } from './modules/packageManager'

export { createModule as unstable_createModule }
export { scaffoldTemplate as unstable_scaffoldTemplate } from './templates'

export const modules = {
  unstable_ideModule,
  unstable_gitModule,
  unstable_coreModule,
  unstable_packageJsonModule,
  unstable_packageManagerModule,
}
