import { useTheme } from '@wildwood/react';
import type { ThemeName } from '@wildwood/core';

const themes: ThemeName[] = [
  'woodland-warm',
  'ocean-breeze',
  'sunset-glow',
  'midnight-dark',
  'forest-green',
  'arctic-frost',
];

export function ThemeTest() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="page">
      <h1>Theme Component</h1>
      <p>Tests theme switching and CSS variable propagation.</p>

      <div className="status-card">
        <h3>Current Theme</h3>
        <p><code>{theme}</code></p>
      </div>

      <div className="button-group">
        {themes.map((t) => (
          <button
            key={t}
            className={theme === t ? 'active' : ''}
            onClick={() => setTheme(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
