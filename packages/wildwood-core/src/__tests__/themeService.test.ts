import { describe, it, expect } from 'vitest';
import { ThemeService } from '../theme/themeService.js';
import { MemoryStorageAdapter } from '../platform/storageService.js';
import { WildwoodEventEmitter } from '../events/eventEmitter.js';

function createService() {
  const storage = new MemoryStorageAdapter();
  const events = new WildwoodEventEmitter();
  return { service: new ThemeService(storage, events), storage, events };
}

describe('ThemeService', () => {
  it('defaults to woodland-warm before initialization', () => {
    const { service } = createService();
    expect(service.theme).toBe('woodland-warm');
  });

  it('initialize loads a persisted theme from storage', async () => {
    const { service, storage } = createService();
    await storage.setItem('ww_theme', 'midnight');

    await service.initialize();

    expect(service.theme).toBe('midnight');
  });

  it('setTheme persists under the ww_theme key and emits themeChanged', async () => {
    const { service, storage, events } = createService();
    let emitted: string | null = null;
    events.on('themeChanged', (theme: string) => {
      emitted = theme;
    });

    await service.setTheme('midnight');

    expect(service.theme).toBe('midnight');
    expect(await storage.getItem('ww_theme')).toBe('midnight');
    expect(emitted).toBe('midnight');
  });
});
