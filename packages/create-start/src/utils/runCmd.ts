import { spawnCommand } from './spawnCmd'

export async function runCmd(
  command: string,
  args: Array<string>,
  env: NodeJS.ProcessEnv = {},
  cwd?: string,
) {
  return spawnCommand(command, args, env, cwd)
}
