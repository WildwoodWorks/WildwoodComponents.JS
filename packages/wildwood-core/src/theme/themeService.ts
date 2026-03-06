// Theme service - manages theme persistence and CSS variable application
// Mirrors WildwoodComponents.Blazor/Services/ComponentThemeService.cs

import type { StorageAdapter } from '../platform/types.js';
import type { WildwoodEventEmitter } from '../events/eventEmitter.js';
import type { ThemeName } from './types.js';

const THEME_STORAGE_KEY = 'ww_theme';

export class ThemeService {
  private currentTheme: ThemeName = 'woodland-warm';

  constructor(
    private storage: StorageAdapter,
    private events: WildwoodEventEmitter,
  ) {}

  get theme(): ThemeName {
    return this.currentTheme;
  }

  async initialize(): Promise<void> {
    const stored = await this.storage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      this.currentTheme = stored as ThemeName;
    }
    this.applyTheme();
  }

  async setTheme(theme: ThemeName): Promise<void> {
    this.currentTheme = theme;
    this.applyTheme();
    await this.storage.setItem(THEME_STORAGE_KEY, theme);
    this.events.emit('themeChanged', theme);
  }

  private applyTheme(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', this.currentTheme);
    }
  }
}
