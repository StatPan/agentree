import { createOpencodeClient } from '@opencode-ai/sdk/v2/client'

const baseUrl = process.env.OPENCODE_API_URL ?? 'http://localhost:6543'
const serverUsername = process.env.OPENCODE_SERVER_USERNAME
const serverPassword = process.env.OPENCODE_SERVER_PASSWORD

const authHeader = serverUsername && serverPassword
  ? `Basic ${Buffer.from(`${serverUsername}:${serverPassword}`).toString('base64')}`
  : undefined

export const opencode = createOpencodeClient({
  baseUrl,
  headers: authHeader ? { Authorization: authHeader } : undefined,
})
