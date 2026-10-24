import assert from 'node:assert/strict'
import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import tanstackRouter from '@tanstack/router-plugin/bun'

export async function verifyBunRouteSourceMaps() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const workspace = path.resolve(here, './.cache/bun-source-maps')
  const fixture = path.join(workspace, 'fixture # %')
  await rm(workspace, { recursive: true, force: true })
  await mkdir(workspace, { recursive: true })
  await cp(path.join(here, 'fixture'), fixture, { recursive: true })

  const authoredSource =
    '\n\nexport const inputMapProbe = "authored input map"\n'
  const inputMap = Buffer.from(
    JSON.stringify({
      version: 3,
      sources: [pathToFileURL(path.join(workspace, 'authored-probe.js')).href],
      sourcesContent: [authoredSource],
      names: [],
      mappings: 'AAEA',
    }),
  ).toString('base64')
  const probe = await Bun.build({
    entrypoints: ['router-input-map-probe'],
    outdir: path.join(workspace, 'probe'),
    sourcemap: 'external',
    plugins: [
      {
        name: 'input-source-map-capability',
        setup(build) {
          build.onResolve({ filter: /^router-input-map-probe$/ }, () => ({
            path: 'probe.js',
            namespace: 'input-map-probe',
          }))
          build.onLoad({ filter: /.*/, namespace: 'input-map-probe' }, () => ({
            contents: `export const inputMapProbe = "generated input map"\n//# sourceMappingURL=data:application/json;base64,${inputMap}`,
            loader: 'js',
          }))
        },
      },
    ],
  })
  assert.equal(probe.success, true, probe.logs.map(String).join('\n'))
  const probeMaps = await Promise.all(
    probe.outputs
      .filter((output) => output.path.endsWith('.map'))
      .map(async (output) => JSON.parse(await output.text())),
  )
  assert.ok(probeMaps.length > 0)
  const supportsInputSourceMaps = probeMaps.some((map) =>
    map.sourcesContent.includes(authoredSource),
  )

  for (const sourcemap of [
    'external',
    'inline',
    'linked',
    undefined,
    false,
    'none',
  ]) {
    const loaded = []
    const router = tanstackRouter({
      target: 'react',
      routesDirectory: path.join(fixture, 'routes'),
      generatedRouteTree: path.join(fixture, 'routeTree.gen.ts'),
      tmpDir: path.join(workspace, 'tmp'),
      autoCodeSplitting: true,
      disableLogging: true,
      codeSplittingOptions: { defaultBehavior: [['loader'], ['component']] },
    })
    const result = await Bun.build({
      entrypoints: [path.join(fixture, 'main.tsx')],
      outdir: path.join(workspace, String(sourcemap)),
      target: 'browser',
      format: 'esm',
      splitting: true,
      sourcemap,
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [
        {
          name: 'observe-router-source-maps',
          setup(build) {
            return router.setup({
              ...build,
              onLoad(options, callback) {
                build.onLoad(options, async (args) => {
                  const result = await callback(args)
                  if (
                    /^tanstack-router-tsr-(split|shared)$/.test(args.namespace)
                  ) {
                    loaded.push({ id: args.path, contents: result.contents })
                  }
                  return result
                })
              },
            })
          },
        },
      ],
    })
    assert.equal(result.success, true, result.logs.map(String).join('\n'))
    for (const parameter of ['tsr-split=', 'tsr-shared=']) {
      assert.ok(loaded.some(({ id }) => id.includes(parameter)))
    }
    for (const { id, contents } of loaded) {
      const inlineMap = contents.match(
        /\/\/# sourceMappingURL=data:application\/json[^,]*;base64,([^\s]+)/,
      )
      if (!sourcemap || sourcemap === 'none') {
        assert.equal(inlineMap, null, `${id}: maps are disabled`)
        continue
      }
      assert.ok(inlineMap, `${id}: forwards the compiler source map`)
      const map = JSON.parse(Buffer.from(inlineMap[1], 'base64').toString())
      const filename = id.split('?')[0]
      assert.deepEqual(map.sources, [pathToFileURL(filename).href])
      assert.deepEqual(map.sourcesContent, [await readFile(filename, 'utf8')])
      assert.ok(map.mappings.length > 0, `${id}: preserves compiler mappings`)
    }
  }
  return supportsInputSourceMaps
}
