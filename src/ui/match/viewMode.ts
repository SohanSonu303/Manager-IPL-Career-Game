export type ViewMode = 'auto' | '3d' | '2d'
export const VIEW_KEY = 'cricket-manager.view'

export function readViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === '3d' || v === '2d' ? v : 'auto'
  } catch {
    return 'auto'
  }
}
