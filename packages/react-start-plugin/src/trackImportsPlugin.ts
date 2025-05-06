import path from 'node:path'
import fs from 'node:fs'
import type { Plugin, Rollup } from 'vite'
import { normalizePath } from 'vite'

export function trackInvalidImportsPlugin(): Array<Plugin> {
  let root = process.cwd() // default, fallback to cwd

  const transforms = new Map<string, Rollup.SourceMap>()
  return [
   /* {
        name: 'fix-sourcemap',
        apply: 'build',
        enforce: 'post',
        generateBundle(_, bundle) {
            console.log('### generateBundle', { bundle })
            for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
                console.log('### fileName', { fileName, chunkOrAsset })
                
              if (
                chunkOrAsset.type === 'chunk' &&
                chunkOrAsset.map &&
                chunkOrAsset.map.sources.some(s => s.includes('?tsr-split'))
              ) {
                console.log('### chunkOrAsset', chunkOrAsset.map.file,  chunkOrAsset.map.sources)
                chunkOrAsset.map.sources = chunkOrAsset.map.sources.map(source =>
                  source.split('?')[0] || source,
                );
                console.log('### chunkOrAsset', chunkOrAsset.map.file,  chunkOrAsset.map.sources)
              }
            }
          }
          ,
          writeBundle(options, bundle) {
            console.log('### writeBundle', bundle)
            for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
                console.log('### fileName', { fileName, chunkOrAsset })
                
              if (
                chunkOrAsset.type === 'chunk' &&
                chunkOrAsset.map &&
                chunkOrAsset.map.sources.some(s => s.includes('?tsr-split'))
              ) {
                console.log('### chunkOrAsset', chunkOrAsset.map.file,  chunkOrAsset.map.sources)
                chunkOrAsset.map.sources = chunkOrAsset.map.sources.map(source =>
                  source.split('?')[0] || source,
                );
                console.log('### chunkOrAsset', chunkOrAsset.map.file,  chunkOrAsset.map.sources)
              }
            }
          },
          
          
    },*/
   /* {
        // apply: 'build',
        name: 'record-transforms',
        enforce: 'post',
        transform(code, id) {
        const map = this.getCombinedSourcemap()
        transforms.set(id, map)
        if (id.includes('tsr-split')) {
            map.sources = map.sources.map(source =>
                source.split('?')[0] || source,
            )
            console.log('### transform', id, code, map)
            return {code, map}
        }
          // console.log('####transform', id, code, this.getCombinedSourcemap())
          // this.getCombinedSourcemap()
          // this.getModuleInfo(id)
          // this.getModuleIds()
          // this.getModuleInfo(id)
          // this.getModuleInfo('__vite-browser-external')
          return undefined
        }
    },*/
    {
    name: 'track-invalid-imports',
    enforce: 'pre',
    configResolved(config) {
      root = config.root
    },

    async resolveId(source, importer, options) {
      if (!importer) return null

      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      })

      if (resolved) {
        const from = makeRelative(normalizePath(importer), root)
        const to = makeRelative(normalizePath(resolved.id), root)
       /* console.log('### resolveId resolved', {
          source,
          importer,
          resolved,
          from,
          to,
        })*/
      }

      return null
    },
    /*load(id) {
        console.log('### load', {id})
    },*/

    buildEnd(error) {
        console.log('### buildEnd', { error })

        if (isRollupError(error)) {
            if (error.exporter === '__vite-browser-external') {
                if (!error.id) {
                    return
                }

                
                const findAllImportPaths = (
                    id: string,
                    currentPath: Array<string> = [],
                    allPaths: Array<Array<string>> = [],
                    visited: Set<string> = new Set(),
                ): Array<Array<string>> => {
                    if (visited.has(id)) {
                        allPaths.push([...currentPath, id])
                        return allPaths // Terminate recursion if cyclic dependency is detected
                    }

                    visited.add(id)

                    const moduleInfo = this.getModuleInfo(id)
                    if (!moduleInfo) {
                        return allPaths
                    }

                    const importers = [...moduleInfo.importers, ...moduleInfo.dynamicImporters]
                    if (importers.length === 0) {
                        allPaths.push([...currentPath, id])
                        return allPaths
                    }

                    for (const importer of importers) {
                        findAllImportPaths(importer, [...currentPath, id], allPaths, visited)
                    }

                    return allPaths
                }

                // Find all paths
                const allImportPaths = findAllImportPaths(error.id).filter(pathArray =>
                    pathArray.some(file => file.startsWith(root))
                )
                console.log('### Filtered Import Paths:', root, allImportPaths)
               
            }
        }
/*
        const moduleIds = this.getModuleIds()
        console.log('### moduleIds', Date.now())
        // iterate over moduleIds, stringify the module ids and log
        let i = 0
        for (const id of moduleIds) {
            i++
          //console.log(id)
          const minfo = this.getModuleInfo(id)
            if (minfo) {
                console.log('##### moduleInfo', id, {
                    dynamicImporters: minfo.dynamicImporters,
                importers: minfo.importers,
                importedIds: minfo.importedIds,
                f: minfo.dynamicallyImportedIdResolutions,
                fa: minfo.id,
                aa: minfo.attributes
                })
               if (minfo.importedIds.includes('not-existing')) {
                throw new Error('foo')
               }
               
            }
          }
          console.log('### moduleIds end', i, Date.now())
*/
          /*
      if (
        !error ||
        !error.message.includes('is not exported by "__vite-browser-external"')
      ) {
        return
      }

      // Try to extract the offending module path from the error message
      const match = error.message.match(/imported by "(.+)"/)
      if (!match || !match[1]) return

      const start = normalizePath(match[1])
      const minfo = this.getModuleInfo('__vite-browser-external')
      if (minfo) {
        console.log('##### moduleInfo importers', '__vite-browser-external', {
          importers: minfo.importers,
          importedIds: minfo.importedIds,
        })
        console.log('minfo.importedIdResolutions', minfo.importedIdResolutions)
        console.log('##### code begin', minfo.code)
        console.log('##### code end')
      }

      const trace: Array<string> = []
      let current = importMap.get(start)
      const visited = new Set<string>()
      while (current) {
        const minfo = this.getModuleInfo(current.resolved)
        if (minfo) {
          console.log(
            'minfo.importedIdResolutions',
            minfo.importedIdResolutions,
          )
          console.log('##### moduleInfo importers', current.resolved, {
            importers: minfo.importers,
            importedIds: minfo.importedIds,
          })
          console.log('##### code begin', minfo.code)
          console.log('##### code end')
          console.log('### ast', minfo.ast)
        }
        if (visited.has(current.from)) {
          this.info(`🚨 Circular import detected in trace`)
          return
        }
        visited.add(current.from)
        trace.push(makeRelative(current.from, root))
        console.log('### current', { current })
        current = importMap.get(makeRelative(current.from, root))
      }

      this.error(
        `🚨 Import trace for failed export:\n🔗 Offending module: __vite-browser-external\n` +
          trace.map((f, i) => `${i === 0 ? '→' : '↳'} ${f}`).join('\n'),
      )
          */
    },
  }]
}
/*
function normalizePath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}*/

function makeRelative(file: string, root: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}


function isRollupError(error: unknown): error is Rollup.RollupError {
  return (
    error instanceof Error &&
    error.name === 'RollupError'
  )
}