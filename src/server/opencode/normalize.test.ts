import { describe, expect, it } from 'vitest'
import { normalizeSession, normalizeStatus, normalizeMessage, normalizeEvent } from './normalize.js'

// ─── normalizeSession ────────────────────────────────────────────────────────

describe('normalizeSession', () => {
  const base = { id: 's1', title: 'Test', directory: '/tmp', time: { created: 1, updated: 2 } }

  it('converts a basic session', () => {
    const result = normalizeSession(base)
    expect(result).toEqual({ id: 's1', title: 'Test', parentID: null, directory: '/tmp', time: { created: 1, updated: 2 } })
  })

  it('sets parentID to null when missing', () => {
    expect(normalizeSession(base).parentID).toBe(null)
  })

  it('preserves parentID when present', () => {
    expect(normalizeSession({ ...base, parentID: 'p1' }).parentID).toBe('p1')
  })

  it('includes share field when present', () => {
    const result = normalizeSession({ ...base, share: { url: 'https://x.com' } })
    expect(result.share).toEqual({ url: 'https://x.com' })
  })

  it('omits share field when absent', () => {
    const result = normalizeSession(base)
    expect(result).not.toHaveProperty('share')
  })
})

// ─── normalizeStatus ─────────────────────────────────────────────────────────

describe('normalizeStatus', () => {
  it('maps idle to idle', () => {
    expect(normalizeStatus({ type: 'idle' })).toBe('idle')
  })

  it('maps busy to running', () => {
    expect(normalizeStatus({ type: 'busy' })).toBe('running')
  })

  it('maps retry to running', () => {
    expect(normalizeStatus({ type: 'retry' })).toBe('running')
  })

  it('defaults undefined to idle', () => {
    expect(normalizeStatus(undefined)).toBe('idle')
  })
})

// ─── normalizeMessage ────────────────────────────────────────────────────────

describe('normalizeMessage', () => {
  it('converts a message with parts', () => {
    const msg = { info: { id: 'm1', role: 'user' }, parts: [{ id: 'p1', type: 'text', text: 'hi' }] }
    const result = normalizeMessage(msg)
    expect(result.info.id).toBe('m1')
    expect(result.parts).toHaveLength(1)
  })

  it('defaults parts to empty array when missing', () => {
    const msg = { info: { id: 'm1', role: 'assistant' } }
    expect(normalizeMessage(msg).parts).toEqual([])
  })
})

// ─── normalizeEvent ──────────────────────────────────────────────────────────

describe('normalizeEvent', () => {
  it('returns null for null/undefined input', () => {
    expect(normalizeEvent(null)).toBe(null)
    expect(normalizeEvent(undefined)).toBe(null)
  })

  it('returns null when type is missing', () => {
    expect(normalizeEvent({ properties: {} })).toBe(null)
  })

  it('returns null when properties is missing', () => {
    expect(normalizeEvent({ type: 'session.status' })).toBe(null)
  })

  it('passes through basic event', () => {
    const result = normalizeEvent({ type: 'session.status', properties: { sessionID: 's1' } })
    expect(result).toEqual({ type: 'session.status', properties: { sessionID: 's1' } })
  })

  it('adds requestID from id fallback for permission events', () => {
    const result = normalizeEvent({ type: 'permission.asked', properties: { id: 'req-1', sessionID: 's1' } })
    expect(result?.properties.requestID).toBe('req-1')
  })

  it('preserves requestID when already present', () => {
    const result = normalizeEvent({ type: 'permission.asked', properties: { requestID: 'req-2', id: 'req-1' } })
    expect(result?.properties.requestID).toBe('req-2')
  })

  it('adds requestID for question events', () => {
    const result = normalizeEvent({ type: 'question.asked', properties: { id: 'q-1' } })
    expect(result?.properties.requestID).toBe('q-1')
  })

  it('converts string delta to object for message.part.delta', () => {
    const result = normalizeEvent({ type: 'message.part.delta', properties: { delta: 'hello', sessionID: 's1' } })
    expect(result?.properties.delta).toEqual({ type: 'text', text: 'hello' })
  })

  it('preserves object delta for message.part.delta', () => {
    const result = normalizeEvent({ type: 'message.part.delta', properties: { delta: { type: 'text', text: 'hi' }, sessionID: 's1' } })
    expect(result?.properties.delta).toEqual({ type: 'text', text: 'hi' })
  })

  it('normalizes session info inside event properties', () => {
    const info = { id: 's1', title: 'T', directory: '/d', time: { created: 1, updated: 2 } }
    const result = normalizeEvent({ type: 'session.created', properties: { info } })
    expect(result?.properties.info).toEqual({ id: 's1', title: 'T', parentID: null, directory: '/d', time: { created: 1, updated: 2 } })
  })
})
