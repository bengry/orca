// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import type { TerminalPaneCloseController } from './use-terminal-pane-close-actions'
import type { VisiblePtyRecoveryState } from './terminal-remote-runtime-recovery-ui-state'
import { updateTerminalRemoteRuntimeRecoveryUiState } from './terminal-remote-runtime-recovery-ui-state'

vi.mock('./use-terminal-pane-process-exit-actions', () => ({
  useTerminalPaneProcessExitActions: () => ({})
}))

import { useTerminalPaneReconciliation } from './use-terminal-pane-reconciliation'

const REMOTE_PTY = 'remote:env-1@@term-1'
const ids = { 1: 'leaf-a', 2: 'leaf-b' } as const

function layout(leafIds: string[]): TerminalLayoutSnapshot {
  const leaf = (leafId: string) => ({ type: 'leaf' as const, leafId })
  const root =
    leafIds.length === 1
      ? leaf(leafIds[0])
      : {
          type: 'split' as const,
          direction: 'vertical' as const,
          first: leaf(leafIds[0]),
          second: leaf(leafIds[1])
        }
  return {
    root,
    activeLeafId: leafIds[0],
    expandedLeafId: null,
    ptyIdsByLeafId: Object.fromEntries(leafIds.map((id) => [id, REMOTE_PTY]))
  } as TerminalLayoutSnapshot
}

function setup() {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  const executeClosePane = vi.fn()
  const persistLayoutSnapshot = vi.fn()
  const bound = new Set([1, 2])
  const manager = {
    getPanes: () => [1, 2].map((id) => ({ id, leafId: ids[id as 1 | 2] })),
    getNumericIdForLeaf: (leafId: string) =>
      leafId === 'leaf-a' ? 1 : leafId === 'leaf-b' ? 2 : null,
    getActivePane: () => ({ id: 1 }),
    setActivePane: vi.fn()
  }
  const transports = new Map(
    [1, 2].map((id) => [id, { getPtyId: () => (bound.has(id) ? REMOTE_PTY : null) }])
  )
  let setStates!: Dispatch<SetStateAction<Record<number, VisiblePtyRecoveryState>>>
  const hook = renderHook(
    ({ restoredLayout }) => {
      const [states, set] = useState<Record<number, VisiblePtyRecoveryState>>({})
      setStates = set
      const managerRef = useRef(manager)
      const paneTransportsRef = useRef(transports)
      const controller = {
        activityIsolationSnapshotRef: { current: new Map() },
        pendingPaneSizeRefreshFrameIdsRef: { current: [] },
        containerRef: { current: null },
        isolatedPaneKey: null,
        closeTerminalLinkActions: vi.fn(),
        executeClosePane,
        isActive: true,
        paneCount: 2,
        persistLayoutSnapshot,
        ptyRecoveryStatesByPaneId: states,
        restoredLayout,
        managerRef,
        paneTransportsRef
      } as unknown as TerminalPaneCloseController
      useTerminalPaneReconciliation(controller)
    },
    { initialProps: { restoredLayout: layout(['leaf-a', 'leaf-b']) } }
  )
  // Mirrors onPtyRecoveryStateRef: the transport reports phase "ended" once it unbinds.
  const reportEnded = (paneId: number) => {
    bound.delete(paneId)
    act(() =>
      setStates((previous) =>
        updateTerminalRemoteRuntimeRecoveryUiState(previous, paneId, {
          phase: 'ended',
          epoch: 0,
          attempt: 0
        })
      )
    )
  }
  return { hook, executeClosePane, reportEnded }
}

describe('useTerminalPaneReconciliation', () => {
  it('removes a host-retired pane once its transport unbinds', () => {
    const { hook, executeClosePane, reportEnded } = setup()
    hook.rerender({ restoredLayout: layout(['leaf-a']) })
    expect(executeClosePane).not.toHaveBeenCalled()
    reportEnded(2)
    expect(executeClosePane).toHaveBeenCalledWith(2)
  })

  it('keeps a pane whose leaf the host still names when its transport unbinds', () => {
    const { executeClosePane, reportEnded } = setup()
    reportEnded(2)
    expect(executeClosePane).not.toHaveBeenCalled()
  })
})
