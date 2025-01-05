import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const length = 100

const main = async () => {
  const absolute = (await readFile('./app/routes/absolute.tsx')).toString()
  const relative = (await readFile('./app/routes/relative.tsx')).toString()
  const searchRoute = (
    await readFile('./app/routes/search/route.tsx')
  ).toString()
  const search = (
    await readFile('./app/routes/search/searchPlaceholder.tsx')
  ).toString()
  const paramsRoute = (
    await readFile('./app/routes/params/route.tsx')
  ).toString()
  const params = await (
    await readFile('./app/routes/params/$paramsPlaceholder.tsx')
  ).toString()

  if (!existsSync('./app/routes/(gen)')) {
    await mkdir('./app/routes/(gen)')
  }

  if (!existsSync('./app/routes/(gen)/search')) {
    await mkdir('./app/routes/(gen)/search')
  }

  if (!existsSync('./app/routes/(gen)/params')) {
    await mkdir('./app/routes/(gen)/params')
  }

  await writeFile('./app/routes/(gen)/search/route.tsx', searchRoute)
  await writeFile('./app/routes/(gen)/params/route.tsx', paramsRoute)

  for (let y = 0; y < length; y = y + 1) {
    const replacedAbsolute = absolute.replaceAll('/absolute', `/absolute${y}`)
    const replacedRelative = relative.replaceAll('/relative', `/relative${y}`)
    const replacedSearch = search.replaceAll('searchPlaceholder', `search${y}`)
    const replacedParams = params.replaceAll('paramsPlaceholder', `param${y}`)
    await writeFile(`./app/routes/(gen)/absolute${y}.tsx`, replacedAbsolute)
    await writeFile(`./app/routes/(gen)/relative${y}.tsx`, replacedRelative)
    await writeFile(`./app/routes/(gen)/search/search${y}.tsx`, replacedSearch)
    await writeFile(`./app/routes/(gen)/params/$param${y}.tsx`, replacedParams)
  }
}

main()
