import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { importGiraWorkspaceStatus } from './giraWorkspaceImport.js'

async function readFixture() {
  const text = await readFile(new URL('./testdata/gira-workspace-status.sample.json', import.meta.url), 'utf8')
  return JSON.parse(text) as unknown
}

describe('importGiraWorkspaceStatus', () => {
  it('maps workspace queue items into read-only Agentree work nodes', async () => {
    const workMap = importGiraWorkspaceStatus(await readFixture())

    expect(workMap.schemaVersion).toBe('agentree-work-map/v1')
    expect(workMap.source).toMatchObject({
      kind: 'gira-workspace-status',
      schemaVersion: 'workspace-queues/v1',
      readOnly: true,
    })
    expect(workMap.nodes).toHaveLength(3)

    const agentree = workMap.nodes.find((node) => node.identity.repo === 'StatPan/agentree' && node.identity.issue === 18)
    expect(agentree).toMatchObject({
      kind: 'gira-work-item',
      identity: {
        repo: 'StatPan/agentree',
        issue: 18,
        branch: 'issue-18-gira-work-map-import',
      },
      status: 'ready',
      queues: ['agent_ready'],
      nextAction: {
        action: 'start_agent',
        command: 'gira ticket start --repo StatPan/agentree --ticket 18 --apply',
      },
    })
    expect(agentree?.sourceLinks.find((link) => link.kind === 'issue')?.url).toBe('https://github.com/StatPan/agentree/issues/18')
    expect(agentree?.sourceLinks.find((link) => link.kind === 'branch')?.url).toBe('https://github.com/StatPan/agentree/tree/issue-18-gira-work-map-import')
  })

  it('merges queue overlap without losing checks, review state, blockers, or reason codes', async () => {
    const workMap = importGiraWorkspaceStatus(await readFixture())
    const gira = workMap.nodes.find((node) => node.identity.repo === 'StatPan/gira' && node.identity.issue === 686)

    expect(gira?.queues).toEqual(['failed_check', 'review_needed'])
    expect(gira?.status).toBe('failed-check')
    expect(gira?.pullRequest).toMatchObject({
      number: 687,
      url: 'https://github.com/StatPan/gira/pull/687',
      state: 'OPEN',
      draft: false,
      reviewDecision: 'REVIEW_REQUIRED',
    })
    expect(gira?.checks).toMatchObject({
      status: 'failing',
      conclusion: 'failure',
      summary: 'docs build failed',
    })
    expect(gira?.review).toMatchObject({
      state: 'review_required',
      decision: 'REVIEW_REQUIRED',
    })
    expect(gira?.blockers).toContain('docs build failed')
    expect(gira?.reasonCodes).toEqual(['checks_failed', 'review_required'])
    expect(gira?.attribution).toEqual({
      kind: 'agent-label',
      value: 'codex',
      confidence: 'low',
    })
  })

  it('preserves unknown attribution instead of inventing an owner', async () => {
    const workMap = importGiraWorkspaceStatus(await readFixture())
    const backlog = workMap.nodes.find((node) => node.identity.repo === 'StatPan/backlog' && node.identity.issue === 31)

    expect(backlog?.status).toBe('needs-human')
    expect(backlog?.attribution).toEqual({
      kind: 'unknown',
      value: null,
      confidence: 'unknown',
    })
  })

  it('creates edges only for source-linked work items present in the import', async () => {
    const workMap = importGiraWorkspaceStatus(await readFixture())
    const parent = workMap.nodes.find((node) => node.identity.repo === 'StatPan/agentree' && node.identity.issue === 18)
    const child = workMap.nodes.find((node) => node.identity.repo === 'StatPan/gira' && node.identity.issue === 686)

    expect(workMap.edges).toHaveLength(1)
    expect(workMap.edges[0]).toMatchObject({
      source: parent?.id,
      target: child?.id,
      kind: 'parent',
      confidence: 'source',
    })
  })

  it('does not export arbitrary raw Gira queue item fields', () => {
    const workMap = importGiraWorkspaceStatus({
      schema_version: 'workspace-queues/v1',
      queues: {
        agent_ready: [
          {
            repo: 'R/O',
            issue: 1,
            branch: 'work',
            title: 'Allowed mapped title',
            productivity_score: 99,
            token_spend: 12345,
            accidental_sensitive_metadata: 'do-not-export',
            nested_unmapped_payload: {
              secret: 'nested-do-not-export',
            },
          },
        ],
      },
    })

    expect(workMap.nodes).toHaveLength(1)
    expect(workMap.nodes[0]?.source).toEqual({
      schemaVersion: 'workspace-queues/v1',
      rawQueue: 'agent_ready',
    })

    const exported = JSON.stringify(workMap)
    expect(exported).not.toContain('productivity_score')
    expect(exported).not.toContain('token_spend')
    expect(exported).not.toContain('accidental_sensitive_metadata')
    expect(exported).not.toContain('nested_unmapped_payload')
    expect(exported).not.toContain('do-not-export')
    expect(exported).not.toContain('nested-do-not-export')
  })

  it('keeps a missing branch identity distinct from a real branch named unknown-branch', () => {
    const workMap = importGiraWorkspaceStatus({
      queues: {
        agent_ready: [
          { repo: 'R/O', issue: 1, branch: 'unknown-branch', title: 'explicit' },
          { repo: 'R/O', issue: 1, title: 'missing' },
        ],
      },
    })

    const explicitBranch = workMap.nodes.find((node) => node.identity.branch === 'unknown-branch')
    const missingBranch = workMap.nodes.find((node) => node.identity.branch === null)

    expect(workMap.nodes).toHaveLength(2)
    expect(explicitBranch?.title).toBe('explicit')
    expect(missingBranch?.title).toBe('missing')
    expect(explicitBranch?.id).not.toBe(missingBranch?.id)
    expect(explicitBranch?.identity.key).toBe('R/O#1@branch:unknown-branch')
    expect(missingBranch?.identity.key).toBe('R/O#1@missing-branch')
  })

  it('skips ambiguous branchless parent edges instead of choosing the first matching branch node', () => {
    const workMap = importGiraWorkspaceStatus({
      queues: {
        agent_ready: [
          { repo: 'R/O', issue: 1, branch: 'a' },
          { repo: 'R/O', issue: 1, branch: 'b' },
          { repo: 'R/O', issue: 2, parent: { repo: 'R/O', issue: 1 } },
        ],
      },
    })

    expect(workMap.nodes).toHaveLength(3)
    expect(workMap.edges).toEqual([])
    expect(workMap.warnings).toContain(
      'skipped parent edge because branchless ref R/O#1 matches multiple imported queue items (R/O#1@branch:a, R/O#1@branch:b)',
    )
  })

  it('returns warnings, not writes, for missing workspace queue data', () => {
    const workMap = importGiraWorkspaceStatus({ schema_version: 'unknown' })

    expect(workMap.nodes).toEqual([])
    expect(workMap.edges).toEqual([])
    expect(workMap.warnings).toContain('input does not contain workspace_queues or a workspace-queues/v1 object')
    expect(workMap.source.readOnly).toBe(true)
  })
})
