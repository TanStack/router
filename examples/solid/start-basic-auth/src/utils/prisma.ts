import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const libsql = createClient({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})

const adapter = new PrismaLibSQL(libsql)
export const prismaClient = new PrismaClient({ adapter })

export function hashPassword(password: string) {
  return new Promise<string>((resolve, reject) => {
    crypto.pbkdf2(password, 'salt', 100000, 64, 'sha256', (err, derivedKey) => {
      if (err) {
        reject(err)
      } else {
        resolve(derivedKey.toString('hex'))
      }
    })
  })
}
