/** Id do painel controlado por uma aba do SegmentedControl (use no elemento role="tabpanel"). */
export function segmentPanelId(idPrefix: string, value: string): string {
  return `${idPrefix}-panel-${value}`;
}

/** Id do botão de uma aba do SegmentedControl (use em aria-labelledby do painel). */
export function segmentTabId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}
