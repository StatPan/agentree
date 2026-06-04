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

  it('returns warnings, not writes, for missing workspace queue data', () => {
    const workMap = importGiraWorkspaceStatus({ schema_version: 'unknown' })

    expect(workMap.nodes).toEqual([])
    expect(workMap.edges).toEqual([])
    expect(workMap.warnings).toContain('input does not contain workspace_queues or a workspace-queues/v1 object')
    expect(workMap.source.readOnly).toBe(true)
  })
})
