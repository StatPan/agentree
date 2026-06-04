# Gira Work-Map Import

Parent roadmap: [#15](https://github.com/StatPan/agentree/issues/15). This slice implements the first read-only import path for [#18](https://github.com/StatPan/agentree/issues/18).

## Boundary

Agentree consumes Gira workspace/status JSON as presentation input only. GitHub issues, pull requests, branches, labels, checks, and reviews remain canonical through GitHub and Gira. The importer does not write to Agentree's SQLite overlay, GitHub, Gira, or any worker runtime.

The first endpoint is:

```text
POST /api/work-map/import/gira
```

Body: a `gira workspace status --json` payload containing `workspace_queues`, or a direct `workspace-queues/v1` object.

Response: `agentree-work-map/v1`.

The response exposes only the mapped work-map fields below plus minimal source metadata such as schema version and queue name. It does not echo raw Gira queue items or arbitrary unmapped payload fields.

## Work Node Mapping

Each Gira queue item becomes one `gira-work-item` node keyed by:

```text
repo + issue + branch
```

If the branch is present, the identity segment is `branch:<name>`. If the branch is not present, the node keeps `branch: null` and uses a `missing-branch` identity segment. Agentree must not infer branch ownership from issue title, timestamps, or agent labels.

Mapped fields:

| Agentree field | Source |
| --- | --- |
| `identity.repo` | `repo` or `repository` |
| `identity.issue` | `issue`, `issue_number`, `ticket`, or `number` |
| `identity.branch` | `branch`, `branch_name`, PR `head_ref`, or evidence `branch` |
| `title` | `title` or `issue_title` |
| `status` | queue membership first, then item status/state fallback |
| `pullRequest` | `pull_request` or `pr` |
| `checks` | `checks_status` / `checks`, including evidence variants |
| `review` | `review_status`, evidence review, or PR review decision |
| `nextAction` | `next_action`, evidence `next_action`, and `next_safe_command` |
| `sourceLinks` | source URLs when present, otherwise derived GitHub repo/issue/PR/branch links |

Queue overlap is preserved by merging duplicate work identities and retaining all queue names, reason codes, blockers, and source links.

## Attribution

The importer preserves low-confidence attribution rather than inventing owners:

- `assignees` and explicit `owner`/`assignee` fields are `source` confidence.
- `agent:*` labels become `agent-label` attribution with `low` confidence.
- Missing attribution remains `unknown`.

No productivity, availability, token-spend, or time-online metrics are imported or computed.

## Edges

The first edge mapping is conservative:

- `parent`, `parent_issue`, or `parent_ticket` creates a `parent` edge.
- `depends_on` creates `depends-on` edges.
- `linked_issues` creates low-confidence `linked` edges.

Edges are emitted only when both endpoints are present in the imported queue data. Missing endpoints produce warnings instead of placeholder tracker records.

## Fixture

The sample fixture lives at:

```text
src/server/work-map/testdata/gira-workspace-status.sample.json
```

It covers ready work, PR review work, failed checks, a human-decision item with unknown attribution, and a source-linked parent edge.

## Follow-Up

The production UI follow-up should add a work-map canvas mode that renders `agentree-work-map/v1` nodes separately from live opencode session nodes, then correlates sessions/runs by `repo + branch + issue` when that evidence exists.
