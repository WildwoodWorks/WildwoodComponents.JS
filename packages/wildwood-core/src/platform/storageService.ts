// Storage adapters - replaces Blazor ILocalStorageService

import type { StorageAdapter } from './types.js';

/** Browser localStorage adapter */
export class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.clear();
  }
}

/** In-memory storage adapter (for Node.js or testing) */
export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/** Create storage adapter from config option */
export function createStorageAdapter(
  storage?: 'localStorage' | 'memory' | StorageAdapter
): StorageAdapter {
  if (!storage || storage === 'localStorage') {
    return new LocalStorageAdapter();
  }
  if (storage === 'memory') {
    return new MemoryStorageAdapter();
  }
  return storage;
}
