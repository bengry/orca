import type { PtyTransportRecoveryState } from './pty-transport-types'

export type VisiblePtyRecoveryState = Omit<PtyTransportRecoveryState, 'phase'> & {
  phase: Extract<PtyTransportRecoveryState['phase'], 'recovering' | 'backoff' | 'disconnected'>
}

function isVisiblePtyRecoveryState(
  state: PtyTransportRecoveryState | null
): state is VisiblePtyRecoveryState {
  return (
    state?.phase === 'recovering' || state?.phase === 'backoff' || state?.phase === 'disconnected'
  )
}

export function updateTerminalRemoteRuntimeRecoveryUiState(
  previous: Record<number, VisiblePtyRecoveryState>,
  paneId: number,
  state: PtyTransportRecoveryState | null
): Record<number, VisiblePtyRecoveryState> {
  if (isVisiblePtyRecoveryState(state)) {
    return previous[paneId] === state ? previous : { ...previous, [paneId]: state }
  }
  if (!(paneId in previous)) {
    // Why: an unbound transport lets the reconciler remove a host-retired pane; a
    // fresh map identity wakes it, since no visible phase change would.
    return state?.phase === 'ended' ? { ...previous } : previous
  }
  const next = { ...previous }
  delete next[paneId]
  return next
}
