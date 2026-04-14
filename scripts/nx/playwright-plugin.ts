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
      (configFile, options, context) =>
        createNodesInternal(configFile, context),
      configFiles,
      options,
      context,
    )
  },
]

async function createNodesInternal(
  configFilePath: string,
  context: CreateNodesContextV2,
) {
  const projectConfiguration = readJsonFile<{
    name?: string
    nx?: { metadata?: { playwrightShards?: number } }
  }>(configFilePath)
  const root = dirname(configFilePath)

  if (!projectConfiguration.nx?.metadata?.playwrightShards) {
    return {
      projects: {
        [root]: {},
      },
    }
  }

  const { targets, targetGroupEntries } = buildShardedTargets(
    root,
    projectConfiguration.name ?? root,
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
        tags: ['playwright:shareded'],
      },
    },
  }
}

const CI_TARGET_NAME = 'test:e2e'

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
