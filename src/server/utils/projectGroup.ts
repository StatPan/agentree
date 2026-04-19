export function projectGroupFromDirectory(directory: string): string {
  const marker = '/workspace/'
  const index = directory.indexOf(marker)
  const normalized = index >= 0 ? directory.slice(index + marker.length) : directory.replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return 'workspace'
  const bucketPrefixes = new Set(['apps', 'research', 'pypi_lib', 'libs', 'infra', 'skills', 'mcps', 'anal-repo'])
  if (parts.length >= 2 && bucketPrefixes.has(parts[0])) {
    return `${parts[0]}/${parts[1]}`
  }
  return parts[0]
}
