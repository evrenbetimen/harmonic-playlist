import { create } from 'zustand';

/**
 * Top-level navigation.
 *
 * The rail used to be decorative, so every section now maps to a real view:
 *   · builder   — set generation controls + wheel/timeline/playlist
 *   · crate     — the full source pool the sequencer can draw from
 *   · routes    — several candidate routes compared side by side
 *   · analytics — distributions and QC evidence
 */
export type ViewId = 'builder' | 'crate' | 'routes' | 'analytics';

interface UiState {
  view: ViewId;
  setView: (view: ViewId) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: 'builder',
  setView: (view) => set({ view }),
}));
