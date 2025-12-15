// Test file: Complex module with server-only code (real-world scenario)
import { db } from './db' // server-only

// This is isomorphic - used on both client and server
export const formatUser = (user: { name: string }) => {
  return user.name.toUpperCase()
}

// This is server-only - should be eliminated when only formatUser is imported
export const getUser = async (id: string) => {
  return db.users.findOne({ id })
}

// This is also server-only
export const deleteUser = async (id: string) => {
  return db.users.delete({ id })
}
