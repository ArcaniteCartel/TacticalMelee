// IPC payload types shared between the preload and the main process.
// Renderer editor components use their own co-located editorTypes.ts
// (src/renderer/src/editor/editorTypes.ts) via relative imports instead.

// Payload returned by plugin:get-active-config IPC.
// raw is the full parsed config object (YAML or standard), including any extra fields.
export interface ActiveConfigPayload {
  mode: 'standard' | 'custom'
  raw: Record<string, unknown>
}

// Payload returned by plugin:save-custom IPC.
export interface SaveResult {
  ok: boolean
  applied: boolean      // true if config was live-reloaded (machine was idle)
  error?: string
}

// Payload returned by plugin:restore-defaults IPC.
export interface RestoreResult {
  backupPath: string
}
