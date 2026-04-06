import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { opencode } from './client.js'
import type { CompatCapabilities, OpencodeCompatReport } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const capabilities: CompatCapabilities = {
  supportsSessionCreate: true,
  supportsSessionFork: true,
  supportsSubtaskPrompt: true,
  supportsTodo: true,
  supportsDiff: true,
  supportsShare: true,
  questionReplyMode: 'string-array-array',
  sessionStatusMode: 'discriminated-union',
}

function detectSdkVersion() {
  try {
    const packageJsonPath = join(__dirname, '..', '..', '..', '..', 'node_modules', '@opencode-ai', 'sdk', 'package.json')
    const content = readFileSync(packageJsonPath, 'utf8')
    const parsed = JSON.parse(content) as { version?: string }
    return parsed.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function getCompatReport(): Promise<OpencodeCompatReport> {
  let serverVersion: string | null = null
  const warnings: string[] = []

  try {
    const health = await opencode.global.health()
    if (health.error) {
      warnings.push(`Failed to query opencode health: ${String(health.error)}`)
    } else {
      const data = health.data as { version?: string | null } | undefined
      serverVersion = data?.version ?? null
      if (!serverVersion) warnings.push('Runtime opencode server version is not exposed by health endpoint.')
    }
  } catch (error) {
    warnings.push(`Failed to detect opencode server version: ${String(error)}`)
  }

  if (warnings.length === 0 && !serverVersion) {
    warnings.push('Runtime opencode server version is not detected yet.')
  }

  return {
    sdkVersion: detectSdkVersion(),
    serverVersion,
    profile: 'opencode-1.3',
    capabilities,
    warnings,
  }
}
