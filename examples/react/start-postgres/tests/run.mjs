import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const databaseDir = await mkdtemp(join(tmpdir(), 'start-postgres-test-'))
const password = randomUUID()
const port = 3121
const database = new EmbeddedPostgres({
  databaseDir,
  port,
  user: 'start_test',
  password,
  persistent: false,
  postgresFlags: ['-h', '127.0.0.1'],
})

try {
  await database.initialise()
  await database.start()
  await database.createDatabase('start_test')
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://start_test:${password}@127.0.0.1:${port}/start_test`,
  }
  for (const args of [
    ['exec', 'prisma', 'generate'],
    ['exec', 'prisma', 'migrate', 'deploy'],
    ['exec', 'playwright', 'test', ...process.argv.slice(2)],
  ]) {
    execFileSync('pnpm', args, { env, stdio: 'inherit' })
  }
} finally {
  await database.stop()
  await rm(databaseDir, { recursive: true, force: true })
}
