import which from 'which'
import spawn from 'cross-spawn'
import { getIdeCommand } from './getIdeCommand'
import type { Ide } from '../constants'

export interface OpenProjectParams {
  projectPath: string
  ide: Ide
}
export async function openProject({ ide, projectPath }: OpenProjectParams) {
  const command = getIdeCommand(ide)
  if (command === undefined) {
    return
  }
  try {
    const resolved = await which(command)
    spawn(resolved, [projectPath], { detached: true })
  } catch (error) {
    console.error(
      `Could not open project using ${ide}, since ${command} was not in your PATH`,
    )
  }
}
