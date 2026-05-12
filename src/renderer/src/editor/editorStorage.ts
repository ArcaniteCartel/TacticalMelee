import localforage from 'localforage'
import type { EditorWorkingCopy } from './editorTypes'

const STORAGE_KEY = 'tm:plugin-editor:working-copy'

export const editorStorage = {
  async load(): Promise<EditorWorkingCopy | null> {
    return localforage.getItem<EditorWorkingCopy>(STORAGE_KEY)
  },
  async save(wc: EditorWorkingCopy): Promise<void> {
    await localforage.setItem(STORAGE_KEY, wc)
  },
  async clear(): Promise<void> {
    await localforage.removeItem(STORAGE_KEY)
  },
}
