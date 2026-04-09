import { cpSync } from 'node:fs'

cpSync('drizzle', 'dist/server/drizzle', { recursive: true })
console.log('Copied drizzle/ → dist/server/drizzle/')
