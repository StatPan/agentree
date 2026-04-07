import { useState } from 'react'

type Props = {
  sessionId: string
  status: string
  onFork: () => Promise<void>
  onSubtask: () => void
  onRefreshMessages: () => Promise<void>
  onRefreshTree: () => Promise<void>
  onError: (msg: string) => void
}

function btn(bg: string, fg: string): React.CSSProperties {
  return {
    padding: '5px 10px', fontSize: 11, fontWeight: 700, border: 'none',
    borderRadius: 6, cursor: 'pointer', background: bg, color: fg,
  }
}

function btnDisabled(base: React.CSSProperties): React.CSSProperties {
  return { ...base, opacity: 0.4, cursor: 'default' }
}

export function SessionActions({ sessionId, status, onFork, onSubtask, onRefreshMessages, onRefreshTree, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [canUnrevert, setCanUnrevert] = useState(false)

  const isRunning = status === 'running'

  async function handleRevert(messageID?: string) {
    setBusy('revert')
    try {
      const res = await fetch(`/api/session/${sessionId}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageID ? { messageID } : {}),
      })
      if (!res.ok) throw new Error('Failed to revert')
      setCanUnrevert(true)
      await onRefreshMessages()
      await onRefreshTree()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleUnrevert() {
    setBusy('unrevert')
    try {
      const res = await fetch(`/api/session/${sessionId}/unrevert`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to unrevert')
      setCanUnrevert(false)
      await onRefreshMessages()
      await onRefreshTree()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleSummarize() {
    setBusy('summarize')
    try {
      const res = await fetch(`/api/session/${sessionId}/summarize`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to summarize')
      await onRefreshMessages()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleShare() {
    setBusy('share')
    try {
      const res = await fetch(`/api/session/${sessionId}/share`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to share')
      const data = await res.json()
      setShareUrl(data.share?.url ?? null)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function handleUnshare() {
    setBusy('unshare')
    try {
      const res = await fetch(`/api/session/${sessionId}/share`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to unshare')
      setShareUrl(null)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={onSubtask} disabled={!!busy} style={busy ? btnDisabled(btn('#2563eb', '#fff')) : btn('#2563eb', '#fff')}>Subtask</button>
        <button
          onClick={() => { if (!busy) { setBusy('fork'); void onFork().finally(() => setBusy(null)) } }}
          disabled={!!busy}
          style={busy ? btnDisabled(btn('#0f766e', '#fff')) : btn('#0f766e', '#fff')}
        >
          {busy === 'fork' ? '...' : 'Fork'}
        </button>
        <button
          onClick={() => void handleRevert()}
          disabled={isRunning || busy === 'revert'}
          style={isRunning ? btnDisabled(btn('#6b21a8', '#fff')) : btn('#6b21a8', '#fff')}
        >
          {busy === 'revert' ? '...' : 'Revert'}
        </button>
        {canUnrevert && (
          <button
            onClick={() => void handleUnrevert()}
            disabled={busy === 'unrevert'}
            style={btn('#4c1d95', '#d8b4fe')}
          >
            {busy === 'unrevert' ? '...' : 'Undo revert'}
          </button>
        )}
        <button
          onClick={() => void handleSummarize()}
          disabled={isRunning || busy === 'summarize'}
          style={isRunning ? btnDisabled(btn('#1e3a5f', '#93c5fd')) : btn('#1e3a5f', '#93c5fd')}
        >
          {busy === 'summarize' ? '...' : 'Summarize'}
        </button>
        {shareUrl ? (
          <button onClick={() => void handleUnshare()} disabled={busy === 'unshare'} style={btn('#7f1d1d', '#fca5a5')}>
            Unshare
          </button>
        ) : (
          <button onClick={() => void handleShare()} disabled={busy === 'share'} style={btn('#1e3a5f', '#93c5fd')}>
            {busy === 'share' ? '...' : 'Share'}
          </button>
        )}
      </div>
      {shareUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: 'monospace' }}>
          <span style={{ color: '#6b7280', flexShrink: 0 }}>share</span>
          <span style={{ color: '#93c5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {shareUrl}
          </span>
          <button
            onClick={() => void navigator.clipboard.writeText(shareUrl)}
            style={{ background: 'none', border: '1px solid #374151', borderRadius: 3, color: '#9ca3af', fontSize: 9, cursor: 'pointer', padding: '1px 5px' }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  )
}

// Export for per-message revert button in SessionPanel
export function RevertToHereButton({ sessionId, messageID, onDone }: { sessionId: string; messageID: string; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function handleClick() {
    if (!window.confirm('Revert to this message? Changes after this point will be undone.')) return
    setBusy(true)
    setError(false)
    try {
      const res = await fetch(`/api/session/${sessionId}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageID }),
      })
      if (!res.ok) throw new Error('Failed to revert')
      await onDone()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={busy}
      title={error ? 'Revert failed' : 'Revert to this message'}
      style={{
        background: 'none', border: 'none', color: error ? '#ef4444' : '#4b5563', fontSize: 10,
        cursor: busy ? 'default' : 'pointer', padding: '0 3px', opacity: busy ? 0.3 : 0.6,
      }}
    >
      ↩
    </button>
  )
}
