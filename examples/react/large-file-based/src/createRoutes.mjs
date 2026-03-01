import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const length = 100
const nestedDepth = 3

const main = async () => {
  const absolute = (await readFile('./src/routes/absolute.tsx')).toString()
  const relative = (await readFile('./src/routes/relative.tsx')).toString()
  const searchRoute = (
    await readFile('./src/routes/search/route.tsx')
  ).toString()
  const search = (
    await readFile('./src/routes/search/searchPlaceholder.tsx')
  ).toString()
  const paramsRoute = (
    await readFile('./src/routes/params/route.tsx')
  ).toString()
  const params = await (
    await readFile('./src/routes/params/$paramsPlaceholder.tsx')
  ).toString()

  if (!existsSync('./src/routes/(gen)')) {
    await mkdir('./src/routes/(gen)')
  }

  if (!existsSync('./src/routes/(gen)/search')) {
    await mkdir('./src/routes/(gen)/search')
  }

  if (!existsSync('./src/routes/(gen)/params')) {
    await mkdir('./src/routes/(gen)/params')
  }

  await writeFile('./src/routes/(gen)/search/route.tsx', searchRoute)
  await writeFile('./src/routes/(gen)/params/route.tsx', paramsRoute)

  const nestedRouteTemplate = (path, label, depthIndex) => {
    const depthAccess = Array.from({ length: depthIndex + 1 }, (_, index) =>
      index === 0 ? 'matches[0].routeId' : `matches[${index}]?.routeId`,
    ).join(' && ')

    return `import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('${path}')({
  component: ${label}Component,
  head: ({ matches }) => {
    if (${depthAccess}) {
      // ...
    }
    return {}
  },
})

function ${label}Component() {
  return (
    <div className="p-2">
      <h3>${label}</h3>
    </div>
  )
}
`
  }

  for (let y = 0; y < length; y = y + 1) {
    const replacedAbsolute = absolute.replaceAll('/absolute', `/absolute${y}`)
    const replacedRelative = relative.replaceAll('/relative', `/relative${y}`)
    const replacedSearch = search.replaceAll('searchPlaceholder', `search${y}`)
    const replacedParams = params.replaceAll('paramsPlaceholder', `param${y}`)
    await writeFile(`./src/routes/(gen)/absolute${y}.tsx`, replacedAbsolute)
    await writeFile(`./src/routes/(gen)/relative${y}.tsx`, replacedRelative)
    await writeFile(`./src/routes/(gen)/search/search${y}.tsx`, replacedSearch)
    await writeFile(`./src/routes/(gen)/params/$param${y}.tsx`, replacedParams)

    const nestedBasePath = `./src/routes/(gen)/nested${y}`
    if (!existsSync(nestedBasePath)) {
      await mkdir(nestedBasePath)
    }

    let currentPath = `/nested${y}`
    let currentDir = nestedBasePath

    for (let depth = 0; depth < nestedDepth; depth = depth + 1) {
      const label = `Nested${y}Level${depth + 1}`
      const segment = `level${depth + 1}`
      const routePath = currentPath

      await writeFile(
        `${currentDir}/route.tsx`,
        nestedRouteTemplate(routePath, label, depth + 1),
      )

      currentPath = `${currentPath}/${segment}`
      currentDir = `${currentDir}/${segment}`

      if (!existsSync(currentDir)) {
        await mkdir(currentDir)
      }
    }

    await writeFile(
      `${currentDir}/leaf.tsx`,
      nestedRouteTemplate(
        `${currentPath}/leaf`,
        `Nested${y}Leaf`,
        nestedDepth + 1,
      ),
    )
  }
}

main()
