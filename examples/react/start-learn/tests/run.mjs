import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const checkpoints = [
  '01-setup',
  '02-routes',
  '03-data',
  '04-forms',
  '05-authentication',
  '06-seo',
  '07-deployment',
  '08-tests',
]
const requested = process.env.COURSE_CHECKPOINT
if (requested && !checkpoints.includes(requested)) {
  throw new Error(`Unknown course checkpoint: ${requested}`)
}
const selected = requested ? [requested] : checkpoints
const mode = process.env.COURSE_PRODUCTION
if (mode !== undefined && mode !== '0' && mode !== '1') {
  throw new Error('COURSE_PRODUCTION must be 0 or 1')
}
const modes = mode === undefined ? ['0', '1'] : [mode]
execFileSync('node', ['tests/check-docs.mjs'], { stdio: 'inherit' })

const reservation = createServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const address = reservation.address()
if (!address || typeof address === 'string') {
  throw new Error('No test database port was allocated')
}
await new Promise((resolve, reject) => {
  reservation.close((error) => (error ? reject(error) : resolve()))
})
const databaseDir = await mkdtemp(join(tmpdir(), 'start-course-test-'))
const password = randomUUID()
const database = new EmbeddedPostgres({
  databaseDir,
  port: address.port,
  user: 'course_test',
  password,
  persistent: false,
  postgresFlags: ['-h', '127.0.0.1'],
})
let started = false
try {
  await database.initialise()
  await database.start()
  started = true
  for (const checkpoint of selected) {
    const number = checkpoint.slice(0, 2)
    const databaseName = `course_${number}`
    const root = `checkpoints/${checkpoint}`
    const port = 3139 + Number(number)
    const connection = `postgresql://course_test:${password}@127.0.0.1:${address.port}/${databaseName}`
    const env = {
      ...process.env,
      DATABASE_URL: connection,
      AUTH_DATABASE_URL: connection,
      BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
      APP_ORIGIN: `http://localhost:${port}`,
      COURSE_CHECKPOINT: checkpoint,
    }
    const run = (args, overrides = {}) =>
      execFileSync('pnpm', args, {
        env: { ...env, ...overrides },
        stdio: 'inherit',
      })
    if (Number(number) >= 3) {
      await database.createDatabase(databaseName)
      run([`db:generate:${number}`])
      run([`db:migrate:${number}`])
      run([`db:seed:${number}`])
    }
    console.log(`Checking ${checkpoint}: build and types`)
    run(['exec', 'vite', 'build', root])
    run(['exec', 'tsc', '-p', root])
    for (const production of modes) {
      console.log(
        `Checking ${checkpoint}: ${production === '1' ? 'production' : 'development'}`,
      )
      run(['exec', 'playwright', 'test', ...process.argv.slice(2)], {
        COURSE_PRODUCTION: production,
      })
    }
  }
} finally {
  try {
    if (started) {
      await database.stop()
    }
  } finally {
    await rm(databaseDir, { recursive: true, force: true })
  }
}
