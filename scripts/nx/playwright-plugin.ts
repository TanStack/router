import { dirname } from 'node:path'
import { createNodesFromFiles, readJsonFile } from '@nx/devkit'
import type {
  CreateNodesContextV2,
  CreateNodesV2,
  TargetConfiguration,
} from '@nx/devkit'

export const createNodesV2: CreateNodesV2 = [
  '**/package.json',
  async (configFiles, options, context) => {
    return await createNodesFromFiles(
      (configFile, _options, context) =>
        createNodesInternal(configFile, context),
      configFiles,
      options,
      context,
    )
  },
]

function createNodesInternal(
  configFilePath: string,
  _context: CreateNodesContextV2,
) {
  const projectConfiguration = readJsonFile<{
    name?: string
    nx?: {
      metadata?: {
        playwrightShards?: number
        playwrightModes?: Array<RawPlaywrightModeMetadata>
      }
    }
  }>(configFilePath)
  const root = dirname(configFilePath)
  const packageName = projectConfiguration.name ?? root
  const playwrightModes =
    projectConfiguration.nx?.metadata?.playwrightModes ?? []

  if (playwrightModes.length > 0) {
    const { targets, targetGroupEntries } = buildModeTargets(
      root,
      packageName,
      playwrightModes,
      ['default', '^production'],
      ['production', '^production'],
    )

    return {
      projects: {
        [root]: {
          targets,
          metadata: {
            targetGroups: {
              playwright: targetGroupEntries,
            },
          },
          tags: ['playwright:sharded'],
        },
      },
    }
  }

  if (!projectConfiguration.nx?.metadata?.playwrightShards) {
    return {
      projects: {
        [root]: {},
      },
    }
  }

  const { targets, targetGroupEntries } = buildShardedTargets(
    root,
    packageName,
    projectConfiguration.nx.metadata.playwrightShards,
    ['default', '^production'],
  )
  // Project configuration to be merged into the rest of the Nx configuration
  return {
    projects: {
      [root]: {
        targets,
        metadata: {
          targetGroups: {
            playwright: targetGroupEntries,
          },
        },
        tags: ['playwright:sharded'],
      },
    },
  }
}

const CI_TARGET_NAME = 'test:e2e'
const MODE_TARGET_SEPARATOR = '--'

const PLAYWRIGHT_TOOLCHAINS = ['vite'] as const
const PLAYWRIGHT_MODES = ['ssr', 'spa', 'prerender', 'preview'] as const

type PlaywrightToolchain = (typeof PLAYWRIGHT_TOOLCHAINS)[number]
type PlaywrightMode = (typeof PLAYWRIGHT_MODES)[number]

type PlaywrightModeMetadata = {
  toolchain: PlaywrightToolchain
  mode: PlaywrightMode
  shards?: number
}

type RawPlaywrightModeMetadata = {
  toolchain?: string
  mode?: string
  shards?: number
}

function isPlaywrightToolchain(
  toolchain: string,
): toolchain is PlaywrightToolchain {
  return PLAYWRIGHT_TOOLCHAINS.includes(toolchain as PlaywrightToolchain)
}

function isPlaywrightMode(mode: string): mode is PlaywrightMode {
  return PLAYWRIGHT_MODES.includes(mode as PlaywrightMode)
}

function withEnvInputs(
  inputs: TargetConfiguration['inputs'],
  envNames: Array<string>,
): TargetConfiguration['inputs'] {
  const baseInputs = inputs ?? []

  return [...baseInputs, ...envNames.map((env) => ({ env }))]
}

function getDistDirName({ toolchain, mode }: PlaywrightModeMetadata): string {
  return `dist-${toolchain}-${mode}`
}

function getBuildTargetName({
  toolchain,
  mode,
}: PlaywrightModeMetadata): string {
  return `build:e2e--${toolchain}-${mode}`
}

function getModeTargetName({
  toolchain,
  mode,
}: PlaywrightModeMetadata): string {
  return `${CI_TARGET_NAME}--${toolchain}-${mode}`
}

function getModeEnv(
  modeMetadata: PlaywrightModeMetadata,
): Record<string, string> {
  const distDir = getDistDirName(modeMetadata)

  return {
    MODE: modeMetadata.mode,
    TOOLCHAIN: modeMetadata.toolchain,
    E2E_TOOLCHAIN: modeMetadata.toolchain,
    E2E_DIST: distDir,
    E2E_DIST_DIR: distDir,
  }
}

function getModePortKey(
  packageName: string,
  modeMetadata: PlaywrightModeMetadata,
  shardIndex?: number,
  shardCount?: number,
): string {
  const modePortKey = `${packageName}-${modeMetadata.toolchain}-${modeMetadata.mode}`

  if (shardIndex === undefined || shardCount === undefined) {
    return modePortKey
  }

  return `${modePortKey}-shard-${shardIndex}-of-${shardCount}`
}

function normalizeShardCount(
  shards: number | undefined,
  targetName: string,
): number {
  if (shards === undefined) {
    return 1
  }

  const shardCount = Number(shards)

  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(
      `[Playwright Sharding Plugin] Invalid shard count for ${targetName}: ${shards}. ` +
        `Expected a positive integer.`,
    )
  }

  return shardCount
}

function validateModeMetadata(
  modeMetadata: RawPlaywrightModeMetadata,
  index: number,
): PlaywrightModeMetadata {
  const targetName = `${modeMetadata.toolchain ?? '<missing toolchain>'}:${modeMetadata.mode ?? '<missing mode>'}`

  if (!modeMetadata.toolchain || !modeMetadata.mode) {
    throw new Error(
      `[Playwright Sharding Plugin] Invalid playwrightModes[${index}] entry: ` +
        `${JSON.stringify(modeMetadata)}. Both "toolchain" and "mode" are required.`,
    )
  }

  if (!isPlaywrightToolchain(modeMetadata.toolchain)) {
    throw new Error(
      `[Playwright Sharding Plugin] Invalid toolchain for playwrightModes[${index}]: ` +
        `${modeMetadata.toolchain}. Supported toolchains: ${PLAYWRIGHT_TOOLCHAINS.join(', ')}.`,
    )
  }

  if (!isPlaywrightMode(modeMetadata.mode)) {
    throw new Error(
      `[Playwright Sharding Plugin] Invalid mode for playwrightModes[${index}]: ` +
        `${modeMetadata.mode}. Supported modes: ${PLAYWRIGHT_MODES.join(', ')}.`,
    )
  }

  normalizeShardCount(modeMetadata.shards, targetName)

  return {
    toolchain: modeMetadata.toolchain,
    mode: modeMetadata.mode,
    shards: modeMetadata.shards,
  }
}

function buildModeTargets(
  projectRoot: string,
  packageName: string,
  modes: Array<RawPlaywrightModeMetadata>,
  testInputs: TargetConfiguration['inputs'],
  buildInputs: TargetConfiguration['inputs'],
): {
  targets: Record<string, TargetConfiguration>
  targetGroupEntries: Array<string>
} {
  const targets: Record<string, TargetConfiguration> = {}
  const targetGroup: Array<string> = []
  const ciDependsOnTargets: Array<{
    target: string
    projects: 'self'
    params: 'forward'
  }> = []

  for (const [index, rawModeMetadata] of modes.entries()) {
    const modeMetadata = validateModeMetadata(rawModeMetadata, index)
    const modeTargetName = getModeTargetName(modeMetadata)
    const buildTargetName = getBuildTargetName(modeMetadata)
    const shardCount = normalizeShardCount(modeMetadata.shards, modeTargetName)
    const modeEnv = getModeEnv(modeMetadata)
    const modePortKey = getModePortKey(packageName, modeMetadata)
    const modeDescription = `${modeMetadata.toolchain}/${modeMetadata.mode}`
    const modeShardTargets: Array<string> = []

    targets[buildTargetName] = {
      executor: 'nx:run-commands',
      options: {
        command: 'vite build && tsc --noEmit',
        cwd: projectRoot,
        env: modeEnv,
      },
      parallelism: false,
      cache: true,
      inputs: withEnvInputs(buildInputs, [
        'MODE',
        'TOOLCHAIN',
        'E2E_TOOLCHAIN',
        'E2E_DIST',
        'E2E_DIST_DIR',
      ]),
      dependsOn: ['^build'],
      outputs: [`{projectRoot}/${getDistDirName(modeMetadata)}`],
      metadata: {
        technologies: ['playwright'],
        description: `Build artifacts for ${modeDescription} e2e tests`,
      },
    }

    if (shardCount === 1) {
      targets[modeTargetName] = {
        executor: 'nx:run-commands',
        options: {
          command: 'playwright test --project=chromium',
          cwd: projectRoot,
          env: {
            ...modeEnv,
            E2E_PORT_KEY: modePortKey,
          },
        },
        cache: true,
        inputs: testInputs,
        dependsOn: [buildTargetName],
        metadata: {
          technologies: ['playwright'],
          description: `Run Playwright tests for ${modeDescription}`,
        },
      }
    } else {
      for (let shardIndex = 1; shardIndex <= shardCount; shardIndex++) {
        const shardTargetName = `${modeTargetName}${MODE_TARGET_SEPARATOR}shard-${shardIndex}-of-${shardCount}`
        const shardPortKey = getModePortKey(
          packageName,
          modeMetadata,
          shardIndex,
          shardCount,
        )

        targets[shardTargetName] = {
          executor: 'nx:run-commands',
          options: {
            command: `playwright test --project=chromium --shard=${shardIndex}/${shardCount}`,
            cwd: projectRoot,
            env: {
              ...modeEnv,
              E2E_PORT_KEY: shardPortKey,
            },
          },
          cache: true,
          inputs: testInputs,
          dependsOn: [buildTargetName],
          metadata: {
            technologies: ['playwright'],
            description: `Run Playwright ${modeDescription} shard ${shardIndex} of ${shardCount}`,
            help: {
              command: `npx playwright run --help`,
              example: {
                options: {
                  shard: `${shardIndex}/${shardCount}`,
                },
              },
            },
          },
        }

        modeShardTargets.push(shardTargetName)
      }

      targets[modeTargetName] = {
        executor: 'nx:noop',
        cache: true,
        inputs: testInputs,
        dependsOn: modeShardTargets.map((shardTargetName) => ({
          target: shardTargetName,
          projects: 'self' as const,
          params: 'forward' as const,
        })),
        metadata: {
          technologies: ['playwright'],
          description: `Run all Playwright ${modeDescription} shards (${shardCount} shards)`,
        },
      }
    }

    ciDependsOnTargets.push({
      target: modeTargetName,
      projects: 'self',
      params: 'forward',
    })
    targetGroup.push(modeTargetName)
  }

  targets[CI_TARGET_NAME] = {
    executor: 'nx:noop',
    cache: true,
    inputs: testInputs,
    dependsOn: ciDependsOnTargets,
    metadata: {
      technologies: ['playwright'],
      description: `Run all Playwright modes (${modes.length} modes)`,
    },
  }

  return {
    targets,
    targetGroupEntries: [...targetGroup, CI_TARGET_NAME],
  }
}

function buildShardedTargets(
  projectRoot: string,
  packageName: string,
  shardCount: number,
  testInputs: TargetConfiguration['inputs'],
): {
  targets: Record<string, TargetConfiguration>
  targetGroupEntries: Array<string>
} {
  const targets: Record<string, TargetConfiguration> = {}
  const targetGroup: Array<string> = []

  // Create individual shard targets
  for (let shardIndex = 1; shardIndex <= shardCount; shardIndex++) {
    const shardTargetName = `${CI_TARGET_NAME}--shard-${shardIndex}-of-${shardCount}`
    const e2ePortKey = `${packageName}-shard-${shardIndex}-of-${shardCount}`

    targets[shardTargetName] = {
      executor: 'nx:run-commands',
      options: {
        command: `playwright test --project=chromium --shard=${shardIndex}/${shardCount}`,
        cwd: projectRoot,
        env: {
          E2E_PORT_KEY: e2ePortKey,
        },
      },
      cache: true,
      inputs: testInputs,
      dependsOn: [`^build`, 'build'],
      metadata: {
        technologies: ['playwright'],
        description: `Run Playwright shard ${shardIndex} of ${shardCount}`,
        help: {
          command: `npx playwright run --help`,
          example: {
            options: {
              shard: `${shardIndex}/${shardCount}`,
            },
          },
        },
      },
    }

    targetGroup.push(shardTargetName)
  }

  // Create the parent CI target that depends on merge (which itself depends on all shards)
  targets[CI_TARGET_NAME] = {
    executor: 'nx:noop',
    cache: true,
    inputs: testInputs,
    dependsOn: targetGroup.map((shardTargetName) => ({
      target: shardTargetName,
      projects: 'self' as const,
      params: 'forward' as const,
    })),
    metadata: {
      technologies: ['playwright'],
      description: `Run all Playwright shards (${shardCount} shards)`,
    },
  }

  return {
    targets,
    targetGroupEntries: [...targetGroup, CI_TARGET_NAME],
  }
}
