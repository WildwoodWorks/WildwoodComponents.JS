import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageAdapter } from '../platform/storageService.js';

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  it('returns null for a non-existent key', async () => {
    const value = await storage.getItem('missing');
    expect(value).toBeNull();
  });

  it('stores and retrieves a value', async () => {
    await storage.setItem('key1', 'value1');
    const result = await storage.getItem('key1');
    expect(result).toBe('value1');
  });

  it('overwrites an existing value', async () => {
    await storage.setItem('key1', 'original');
    await storage.setItem('key1', 'updated');
    expect(await storage.getItem('key1')).toBe('updated');
  });

  it('removes a specific key', async () => {
    await storage.setItem('key1', 'value1');
    await storage.setItem('key2', 'value2');

    await storage.removeItem('key1');

    expect(await storage.getItem('key1')).toBeNull();
    expect(await storage.getItem('key2')).toBe('value2');
  });

  it('removeItem on non-existent key does not throw', async () => {
    await expect(storage.removeItem('nope')).resolves.toBeUndefined();
  });

  it('clear() removes all keys', async () => {
    await storage.setItem('a', '1');
    await storage.setItem('b', '2');
    await storage.setItem('c', '3');

    await storage.clear();

    expect(await storage.getItem('a')).toBeNull();
    expect(await storage.getItem('b')).toBeNull();
    expect(await storage.getItem('c')).toBeNull();
  });

  it('handles empty string values', async () => {
    await storage.setItem('empty', '');
    expect(await storage.getItem('empty')).toBe('');
  });

  it('handles JSON-serialized values', async () => {
    const data = JSON.stringify({ token: 'abc', exp: 123 });
    await storage.setItem('session', data);
    const retrieved = JSON.parse((await storage.getItem('session'))!);
    expect(retrieved.token).toBe('abc');
    expect(retrieved.exp).toBe(123);
  });
});
