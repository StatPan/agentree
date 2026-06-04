export type WorkNodeStatus =
  | 'ready'
  | 'review'
  | 'finish-ready'
  | 'blocked'
  | 'failed-check'
  | 'needs-human'
  | 'open'
  | 'closed'
  | 'unknown'

export type Confidence = 'source' | 'derived' | 'low' | 'unknown'

export type WorkSourceLink = {
  kind: 'repo' | 'issue' | 'pull_request' | 'branch' | 'source'
  url: string
  confidence: Confidence
}

export type WorkNodeAttribution = {
  kind: 'assignee' | 'explicit-owner' | 'agent-label' | 'unknown'
  value: string | null
  confidence: Confidence
}

export type WorkNode = {
  id: string
  kind: 'gira-work-item'
  identity: {
    repo: string
    issue: number
    branch: string | null
    key: string
  }
  title: string
  status: WorkNodeStatus
  queues: string[]
  state: string | null
  labels: string[]
  milestone: string | null
  pullRequest: {
    number: number | null
    url: string | null
    state: string | null
    draft: boolean | null
    reviewDecision: string | null
  } | null
  checks: {
    status: string | null
    conclusion: string | null
    summary: string | null
  }
  review: {
    state: string | null
    decision: string | null
  }
  nextAction: {
    action: string | null
    command: string | null
  }
  blockers: string[]
  reasonCodes: string[]
  attribution: WorkNodeAttribution
  sourceLinks: WorkSourceLink[]
  source: {
    schemaVersion: string | null
    rawQueue: string | null
  }
}

export type WorkEdge = {
  id: string
  source: string
  target: string
  kind: 'parent' | 'depends-on' | 'linked'
  confidence: Confidence
}

export type GiraWorkMap = {
  schemaVersion: 'agentree-work-map/v1'
  source: {
    kind: 'gira-workspace-status'
    schemaVersion: string | null
    workspace: Record<string, unknown> | null
    readOnly: true
  }
  nodes: WorkNode[]
  edges: WorkEdge[]
  warnings: string[]
}

type ImportCandidate = {
  node: WorkNode
  edgeRefs: EdgeRef[]
}

type EdgeRef = {
  from: WorkIdentityRef
  to: WorkIdentityRef
  kind: WorkEdge['kind']
  confidence: Confidence
}

type WorkIdentityRef = {
  repo: string
  issue: number
  branch: string | null
}

type RefResolution =
  | { kind: 'found'; node: WorkNode }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; ref: WorkIdentityRef; candidates: WorkNode[] }

const STATUS_PRIORITY: Record<WorkNodeStatus, number> = {
  'failed-check': 80,
  blocked: 70,
  'needs-human': 60,
  review: 50,
  'finish-ready': 40,
  ready: 30,
  open: 20,
  closed: 10,
  unknown: 0,
}

const QUEUE_STATUS: Record<string, WorkNodeStatus> = {
  failed_check: 'failed-check',
  blocked: 'blocked',
  human_decision: 'needs-human',
  review_needed: 'review',
  finish_ready: 'finish-ready',
  agent_ready: 'ready',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value)
  return null
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(stringValue).filter((item): item is string => Boolean(item))
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const result = stringValue(value)
    if (result) return result
  }
  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const result = numberValue(value)
    if (result !== null) return result
  }
  return null
}

function repoUrl(repo: string) {
  return `https://github.com/${repo}`
}

function issueUrl(repo: string, issue: number) {
  return `${repoUrl(repo)}/issues/${issue}`
}

function pullRequestUrl(repo: string, prNumber: number) {
  return `${repoUrl(repo)}/pull/${prNumber}`
}

function branchUrl(repo: string, branch: string) {
  return `${repoUrl(repo)}/tree/${encodeURIComponent(branch)}`
}

function branchIdentityPart(branch: string | null) {
  return branch === null ? 'missing-branch' : `branch:${branch}`
}

function workNodeId(ref: WorkIdentityRef) {
  return [
    'gira',
    encodeURIComponent(ref.repo),
    String(ref.issue),
    encodeURIComponent(branchIdentityPart(ref.branch)),
  ].join(':')
}

function workIdentityKey(ref: WorkIdentityRef) {
  return `${ref.repo}#${ref.issue}@${branchIdentityPart(ref.branch)}`
}

function collectQueueItems(queuesRoot: Record<string, unknown>, warnings: string[]): Array<{ queue: string; item: Record<string, unknown> }> {
  const queues = queuesRoot.queues
  if (!isRecord(queues)) {
    warnings.push('workspace queues object is missing a queues map')
    return []
  }

  const result: Array<{ queue: string; item: Record<string, unknown> }> = []
  for (const [queue, value] of Object.entries(queues)) {
    if (!Array.isArray(value)) {
      warnings.push(`queue ${queue} is not an array and was skipped`)
      continue
    }
    for (const item of value) {
      if (isRecord(item)) {
        result.push({ queue, item })
      } else {
        warnings.push(`queue ${queue} contains a non-object item and it was skipped`)
      }
    }
  }
  return result
}

function workspaceQueuesFromInput(input: unknown, warnings: string[]): Record<string, unknown> | null {
  if (!isRecord(input)) {
    warnings.push('input is not a JSON object')
    return null
  }

  if (isRecord(input.workspace_queues)) return input.workspace_queues
  if (isRecord(input.workspaceQueues)) return input.workspaceQueues
  if (isRecord(input.derived) && isRecord(input.derived.workspace_queues)) return input.derived.workspace_queues
  if (isRecord(input.queues)) return input

  warnings.push('input does not contain workspace_queues or a workspace-queues/v1 object')
  return null
}

function readNestedRecord(item: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = item[key]
  return isRecord(value) ? value : {}
}

function extractEvidence(item: Record<string, unknown>): Record<string, unknown> {
  return readNestedRecord(item, 'evidence')
}

function extractPullRequest(item: Record<string, unknown>, repo: string): WorkNode['pullRequest'] {
  const pr = isRecord(item.pull_request) ? item.pull_request : readNestedRecord(item, 'pr')
  const number = firstNumber(pr.number, pr.pr_number, item.pr, item.pr_number)
  const url = firstString(pr.url, pr.html_url) ?? (number ? pullRequestUrl(repo, number) : null)
  const state = firstString(pr.state)
  const draft = booleanValue(pr.draft)
  const reviewDecision = firstString(pr.review_decision, pr.reviewDecision)

  if (number === null && !url && !state && draft === null && !reviewDecision) return null
  return { number, url, state, draft, reviewDecision }
}

function extractBranch(item: Record<string, unknown>, pr: Record<string, unknown>): { branch: string | null; confidence: Confidence } {
  const evidence = extractEvidence(item)
  const branch = firstString(item.branch, item.branch_name, pr.head_ref, pr.branch, evidence.branch)
  if (!branch) return { branch: null, confidence: 'unknown' }
  if (stringValue(item.branch) || stringValue(item.branch_name)) return { branch, confidence: 'source' }
  if (stringValue(pr.head_ref) || stringValue(pr.branch)) return { branch, confidence: 'source' }
  return { branch, confidence: 'low' }
}

function extractChecks(item: Record<string, unknown>): WorkNode['checks'] {
  const evidence = extractEvidence(item)
  const candidate = item.checks_status ?? item.checks ?? evidence.checks_status ?? evidence.checks
  if (typeof candidate === 'string') {
    return { status: candidate, conclusion: null, summary: null }
  }
  if (isRecord(candidate)) {
    return {
      status: firstString(candidate.status, candidate.state),
      conclusion: firstString(candidate.conclusion, candidate.result),
      summary: firstString(candidate.summary, candidate.description),
    }
  }
  return { status: null, conclusion: null, summary: null }
}

function extractReview(item: Record<string, unknown>, pullRequest: WorkNode['pullRequest']): WorkNode['review'] {
  const evidence = extractEvidence(item)
  const candidate = item.review_status ?? evidence.review_status ?? evidence.review
  if (typeof candidate === 'string') return { state: candidate, decision: pullRequest?.reviewDecision ?? null }
  if (isRecord(candidate)) {
    return {
      state: firstString(candidate.status, candidate.state),
      decision: firstString(candidate.decision, candidate.review_decision) ?? pullRequest?.reviewDecision ?? null,
    }
  }
  return { state: null, decision: pullRequest?.reviewDecision ?? null }
}

function extractNextAction(item: Record<string, unknown>): WorkNode['nextAction'] {
  const evidence = extractEvidence(item)
  const action = firstString(item.next_action, evidence.next_action)
  const command = firstString(item.next_safe_command, evidence.next_safe_command)
  return { action, command }
}

function extractBlockers(item: Record<string, unknown>): string[] {
  const evidence = extractEvidence(item)
  const blockers = item.blockers ?? evidence.blockers
  if (typeof blockers === 'string') return [blockers]
  return stringArray(blockers)
}

function extractAttribution(item: Record<string, unknown>, labels: string[]): WorkNodeAttribution {
  const assignees = stringArray(item.assignees)
  if (assignees.length > 0) {
    return { kind: 'assignee', value: assignees.join(', '), confidence: 'source' }
  }

  const owner = firstString(item.owner, item.assignee)
  if (owner) {
    return { kind: 'explicit-owner', value: owner, confidence: 'source' }
  }

  const agentLabel = labels.find((label) => label.startsWith('agent:'))
  if (agentLabel) {
    return { kind: 'agent-label', value: agentLabel.slice('agent:'.length), confidence: 'low' }
  }

  return { kind: 'unknown', value: null, confidence: 'unknown' }
}

function extractStatus(queue: string, item: Record<string, unknown>): WorkNodeStatus {
  const queueStatus = QUEUE_STATUS[queue]
  if (queueStatus) return queueStatus

  const status = firstString(item.status, item.state)?.toLowerCase()
  if (!status) return 'unknown'
  if (status.includes('blocked')) return 'blocked'
  if (status.includes('review')) return 'review'
  if (status.includes('ready')) return 'ready'
  if (status.includes('closed') || status.includes('done') || status.includes('merged')) return 'closed'
  if (status.includes('open')) return 'open'
  return 'unknown'
}

function mergeStatus(left: WorkNodeStatus, right: WorkNodeStatus): WorkNodeStatus {
  return STATUS_PRIORITY[right] > STATUS_PRIORITY[left] ? right : left
}

function hasChecks(checks: WorkNode['checks']) {
  return Boolean(checks.status || checks.conclusion || checks.summary)
}

function checkLooksFailed(checks: WorkNode['checks']) {
  return `${checks.status ?? ''} ${checks.conclusion ?? ''}`.toLowerCase().includes('fail')
}

function mergeChecks(left: WorkNode['checks'], right: WorkNode['checks']) {
  if (!hasChecks(left)) return right
  if (!hasChecks(right)) return left
  return checkLooksFailed(right) ? right : left
}

function sourceLinksFromItem(
  item: Record<string, unknown>,
  repo: string,
  issue: number,
  branch: string | null,
  branchConfidence: Confidence,
  pullRequest: WorkNode['pullRequest'],
): WorkSourceLink[] {
  const sourceLinks = readNestedRecord(item, 'source_links')
  const links: WorkSourceLink[] = [
    { kind: 'repo', url: firstString(sourceLinks.repo, item.repo_url) ?? repoUrl(repo), confidence: 'derived' },
    { kind: 'issue', url: firstString(sourceLinks.issue, item.url, item.html_url, item.issue_url) ?? issueUrl(repo, issue), confidence: 'derived' },
  ]

  if (branch) {
    links.push({
      kind: 'branch',
      url: firstString(sourceLinks.branch, item.branch_url) ?? branchUrl(repo, branch),
      confidence: branchConfidence === 'unknown' ? 'derived' : branchConfidence,
    })
  }
  if (pullRequest?.url) {
    links.push({ kind: 'pull_request', url: pullRequest.url, confidence: pullRequest.number ? 'derived' : 'source' })
  }

  const extra = sourceLinks.source
  if (typeof extra === 'string') {
    links.push({ kind: 'source', url: extra, confidence: 'source' })
  }

  return dedupeLinks(links)
}

function dedupeLinks(links: WorkSourceLink[]) {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = `${link.kind}:${link.url}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function refFromUnknown(value: unknown, fallbackRepo: string): WorkIdentityRef | null {
  if (typeof value === 'number') return { repo: fallbackRepo, issue: value, branch: null }
  if (typeof value === 'string') {
    const crossRepo = value.match(/^([^#\s]+\/[^#\s]+)#(\d+)$/)
    if (crossRepo) return { repo: crossRepo[1], issue: Number(crossRepo[2]), branch: null }
    const issue = numberValue(value.replace(/^#/, ''))
    return issue === null ? null : { repo: fallbackRepo, issue, branch: null }
  }
  if (isRecord(value)) {
    const repo = firstString(value.repo, value.repository) ?? fallbackRepo
    const issue = firstNumber(value.issue, value.issue_number, value.ticket, value.number)
    const branch = firstString(value.branch)
    if (issue !== null) return { repo, issue, branch }
  }
  return null
}

function extractEdgeRefs(item: Record<string, unknown>, self: WorkIdentityRef): EdgeRef[] {
  const refs: EdgeRef[] = []
  const parent = refFromUnknown(item.parent ?? item.parent_issue ?? item.parent_ticket, self.repo)
  if (parent) refs.push({ from: parent, to: self, kind: 'parent', confidence: 'source' })

  for (const dependency of Array.isArray(item.depends_on) ? item.depends_on : []) {
    const ref = refFromUnknown(dependency, self.repo)
    if (ref) refs.push({ from: ref, to: self, kind: 'depends-on', confidence: 'source' })
  }

  for (const linked of Array.isArray(item.linked_issues) ? item.linked_issues : []) {
    const ref = refFromUnknown(linked, self.repo)
    if (ref) refs.push({ from: ref, to: self, kind: 'linked', confidence: 'low' })
  }

  return refs
}

function parseQueueItem(
  item: Record<string, unknown>,
  queue: string,
  schemaVersion: string | null,
  warnings: string[],
): ImportCandidate | null {
  const repo = firstString(item.repo, item.repository)
  const issue = firstNumber(item.issue, item.issue_number, item.ticket, item.number)
  if (!repo || issue === null) {
    warnings.push(`queue ${queue} item missing repo or issue and was skipped`)
    return null
  }

  const rawPr = isRecord(item.pull_request) ? item.pull_request : readNestedRecord(item, 'pr')
  const { branch, confidence: branchConfidence } = extractBranch(item, rawPr)
  const ref = { repo, issue, branch }
  const pullRequest = extractPullRequest(item, repo)
  const labels = stringArray(item.labels)

  const node: WorkNode = {
    id: workNodeId(ref),
    kind: 'gira-work-item',
    identity: {
      repo,
      issue,
      branch,
      key: workIdentityKey(ref),
    },
    title: firstString(item.title, item.issue_title) ?? `${repo}#${issue}`,
    status: extractStatus(queue, item),
    queues: unique([firstString(item.queue) ?? queue]),
    state: firstString(item.state),
    labels,
    milestone: firstString(item.milestone),
    pullRequest,
    checks: extractChecks(item),
    review: extractReview(item, pullRequest),
    nextAction: extractNextAction(item),
    blockers: extractBlockers(item),
    reasonCodes: unique(stringArray(item.reason_codes)),
    attribution: extractAttribution(item, labels),
    sourceLinks: sourceLinksFromItem(item, repo, issue, branch, branchConfidence, pullRequest),
    source: {
      schemaVersion,
      rawQueue: queue,
    },
  }

  return { node, edgeRefs: extractEdgeRefs(item, ref) }
}

function mergeNodes(left: WorkNode, right: WorkNode): WorkNode {
  return {
    ...left,
    status: mergeStatus(left.status, right.status),
    queues: unique([...left.queues, ...right.queues]).sort(),
    labels: unique([...left.labels, ...right.labels]).sort(),
    blockers: unique([...left.blockers, ...right.blockers]),
    reasonCodes: unique([...left.reasonCodes, ...right.reasonCodes]).sort(),
    pullRequest: left.pullRequest ?? right.pullRequest,
    checks: mergeChecks(left.checks, right.checks),
    review: left.review.state || left.review.decision ? left.review : right.review,
    nextAction: left.nextAction.action || left.nextAction.command ? left.nextAction : right.nextAction,
    attribution: left.attribution.kind === 'unknown' ? right.attribution : left.attribution,
    sourceLinks: dedupeLinks([...left.sourceLinks, ...right.sourceLinks]),
    source: left.source,
  }
}

function refLabel(ref: WorkIdentityRef) {
  return ref.branch === null ? `${ref.repo}#${ref.issue}` : `${ref.repo}#${ref.issue}@${ref.branch}`
}

function findNodeForRef(ref: WorkIdentityRef, nodesById: Map<string, WorkNode>): RefResolution {
  const exact = nodesById.get(workNodeId(ref))
  if (exact) return { kind: 'found', node: exact }
  if (ref.branch !== null) return { kind: 'missing' }

  const candidates = [...nodesById.values()].filter((node) => node.identity.repo === ref.repo && node.identity.issue === ref.issue)
  if (candidates.length === 1) return { kind: 'found', node: candidates[0]! }
  if (candidates.length > 1) return { kind: 'ambiguous', ref, candidates }
  return { kind: 'missing' }
}

function ambiguousRefWarning(edgeKind: WorkEdge['kind'], resolutions: RefResolution[]) {
  const refs = resolutions
    .filter((resolution): resolution is Extract<RefResolution, { kind: 'ambiguous' }> => resolution.kind === 'ambiguous')
    .map((resolution) => {
      const candidates = resolution.candidates.map((node) => node.identity.key).sort().join(', ')
      return `${refLabel(resolution.ref)} matches multiple imported queue items (${candidates})`
    })
    .join('; ')

  return `skipped ${edgeKind} edge because branchless ref ${refs}`
}

function buildEdges(edgeRefs: EdgeRef[], nodesById: Map<string, WorkNode>, warnings: string[]): WorkEdge[] {
  const edges = new Map<string, WorkEdge>()

  for (const ref of edgeRefs) {
    const source = findNodeForRef(ref.from, nodesById)
    const target = findNodeForRef(ref.to, nodesById)
    if (source.kind === 'ambiguous' || target.kind === 'ambiguous') {
      warnings.push(ambiguousRefWarning(ref.kind, [source, target]))
      continue
    }
    if (source.kind === 'missing' || target.kind === 'missing') {
      warnings.push(`skipped ${ref.kind} edge because one endpoint is not present in the imported queue items`)
      continue
    }

    const id = `${ref.kind}:${source.node.id}:${target.node.id}`
    edges.set(id, { id, source: source.node.id, target: target.node.id, kind: ref.kind, confidence: ref.confidence })
  }

  return [...edges.values()].sort((left, right) => left.id.localeCompare(right.id))
}

export function importGiraWorkspaceStatus(input: unknown): GiraWorkMap {
  const warnings: string[] = []
  const queuesRoot = workspaceQueuesFromInput(input, warnings)
  const schemaVersion = queuesRoot ? firstString(queuesRoot.schema_version, queuesRoot.schemaVersion) : null
  const workspace = queuesRoot && isRecord(queuesRoot.workspace) ? queuesRoot.workspace : null
  const nodesById = new Map<string, WorkNode>()
  const edgeRefs: EdgeRef[] = []

  if (queuesRoot) {
    for (const { queue, item } of collectQueueItems(queuesRoot, warnings)) {
      const candidate = parseQueueItem(item, queue, schemaVersion, warnings)
      if (!candidate) continue
      const existing = nodesById.get(candidate.node.id)
      nodesById.set(candidate.node.id, existing ? mergeNodes(existing, candidate.node) : candidate.node)
      edgeRefs.push(...candidate.edgeRefs)
    }
  }

  const nodes = [...nodesById.values()].sort((left, right) => left.identity.key.localeCompare(right.identity.key))
  const edges = buildEdges(edgeRefs, nodesById, warnings)

  return {
    schemaVersion: 'agentree-work-map/v1',
    source: {
      kind: 'gira-workspace-status',
      schemaVersion,
      workspace,
      readOnly: true,
    },
    nodes,
    edges,
    warnings,
  }
}
