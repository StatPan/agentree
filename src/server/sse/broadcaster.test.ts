import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/index.js', () => ({
  upsertTaskInvocation: vi.fn(),
  linkTaskInvocationToChild: vi.fn(),
}))

vi.mock('../opencode/index.js', () => ({
  opencodeAdapter: {
    globalEventStream: vi.fn(),
  },
}))

import { linkTaskInvocationToChild, upsertTaskInvocation } from '../db/index.js'
import { trackTaskLineage } from './broadcaster.js'

describe('trackTaskLineage collaboration contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tracks two independent subtask parts and links each child session to the parent lineage', () => {
    trackTaskLineage({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'prt_alpha',
          sessionID: 'parent-1',
          messageID: 'msg-a',
          type: 'subtask',
          prompt: 'Return only ALPHA=RED-734',
          description: 'Find alpha token',
          agent: 'explore',
        },
      },
    })
    trackTaskLineage({
      type: 'session.created',
      properties: {
        info: {
          id: 'child-alpha',
          parentID: 'parent-1',
        },
      },
    })

    trackTaskLineage({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'prt_beta',
          sessionID: 'parent-1',
          messageID: 'msg-b',
          type: 'subtask',
          prompt: 'Return only BETA=BLUE-912',
          description: 'Find beta token',
          agent: 'explore',
        },
      },
    })
    trackTaskLineage({
      type: 'session.created',
      properties: {
        info: {
          id: 'child-beta',
          parentID: 'parent-1',
        },
      },
    })

    expect(upsertTaskInvocation).toHaveBeenCalledTimes(2)
    expect(upsertTaskInvocation).toHaveBeenNthCalledWith(1, {
      parentSessionId: 'parent-1',
      messageId: 'msg-a',
      partId: 'prt_alpha',
      agent: 'explore',
      description: 'Find alpha token',
      promptPreview: 'Return only ALPHA=RED-734',
    })
    expect(upsertTaskInvocation).toHaveBeenNthCalledWith(2, {
      parentSessionId: 'parent-1',
      messageId: 'msg-b',
      partId: 'prt_beta',
      agent: 'explore',
      description: 'Find beta token',
      promptPreview: 'Return only BETA=BLUE-912',
    })
    expect(linkTaskInvocationToChild).toHaveBeenCalledTimes(2)
    expect(linkTaskInvocationToChild).toHaveBeenNthCalledWith(1, 'parent-1', 'child-alpha')
    expect(linkTaskInvocationToChild).toHaveBeenNthCalledWith(2, 'parent-1', 'child-beta')
  })

  it('ignores non-subtask message parts', () => {
    trackTaskLineage({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'prt_text',
          sessionID: 'parent-1',
          messageID: 'msg-text',
          type: 'text',
          text: 'hello',
        },
      },
    })

    expect(upsertTaskInvocation).not.toHaveBeenCalled()
    expect(linkTaskInvocationToChild).not.toHaveBeenCalled()
  })
})
