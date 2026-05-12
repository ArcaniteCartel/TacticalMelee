// ── PluginManager ─────────────────────────────────────────────────────────────
//
// Owns the custom YAML plugin lifecycle on the main process:
//   - Checks for an existing custom-plugin.yaml in Electron's userData directory
//     on startup and caches it as the active config.
//   - Provides getActivePluginConfig() as the single source of truth for IPC
//     handlers that need the live plugin (replacing direct ActivePlugin access).
//   - Saves a new custom YAML, backing the parsed config into memory so subsequent
//     calls to getActivePluginConfig() see the change immediately.
//   - Restores defaults by archiving the current custom YAML and clearing the cache.
//
// File layout (under app.getPath('userData')):
//   custom-plugin.yaml                   — active custom plugin (absent = use standard)
//   plugin-backups/custom-plugin-*.yaml  — timestamped archives written on RESTORE

import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, copyFile, unlink } from 'fs/promises'
import { parse } from 'yaml'
import { ActivePlugin } from './ActivePlugin'
import type { PluginConfig } from '../../shared/types'

export class PluginManager {
  private readonly customYamlPath: string
  private readonly backupDir: string

  // Parsed custom config. null → standard plugin is active.
  private customConfig: PluginConfig | null = null
  // Full parsed YAML object (including any extra fields not in PluginConfig).
  // Returned to the editor so extra fields are preserved across sessions.
  private customRaw: Record<string, unknown> | null = null

  constructor() {
    const userData = app.getPath('userData')
    this.customYamlPath = join(userData, 'custom-plugin.yaml')
    this.backupDir      = join(userData, 'plugin-backups')
  }

  // Call once during app.whenReady before creating the main window.
  async initialize(): Promise<void> {
    try {
      const content   = await readFile(this.customYamlPath, 'utf8')
      this.customRaw  = parse(content) as Record<string, unknown>
      this.customConfig = this.customRaw as unknown as PluginConfig
    } catch {
      // File absent or unreadable — fall through to standard plugin
    }
  }

  getMode(): 'standard' | 'custom' {
    return this.customConfig ? 'custom' : 'standard'
  }

  // Returns the active PluginConfig (custom or standard).
  getActivePluginConfig(): PluginConfig {
    return this.customConfig ?? ActivePlugin.getStandardConfig()
  }

  // Returns the payload sent to the editor for initialisation.
  // raw preserves extra fields that PluginConfig doesn't know about.
  getActiveConfigForEditor(): { mode: 'standard' | 'custom'; raw: Record<string, unknown> } {
    if (this.customRaw) {
      return { mode: 'custom', raw: this.customRaw }
    }
    // Standard config: deep-clone via JSON round-trip so the editor gets a plain object.
    const raw = JSON.parse(JSON.stringify(ActivePlugin.getStandardConfig())) as Record<string, unknown>
    return { mode: 'standard', raw }
  }

  // Writes yamlContent to disk and updates the in-memory cache.
  async saveCustom(yamlContent: string): Promise<void> {
    this.customRaw    = parse(yamlContent) as Record<string, unknown>
    this.customConfig = this.customRaw as unknown as PluginConfig
    await writeFile(this.customYamlPath, yamlContent, 'utf8')
  }

  // Archives the current custom YAML and reverts to standard.
  // Returns the path of the backup file.
  async restoreDefaults(): Promise<string> {
    await mkdir(this.backupDir, { recursive: true })
    const stamp      = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(this.backupDir, `custom-plugin-${stamp}.yaml`)
    await copyFile(this.customYamlPath, backupPath)
    await unlink(this.customYamlPath)
    this.customConfig = null
    this.customRaw    = null
    return backupPath
  }
}
