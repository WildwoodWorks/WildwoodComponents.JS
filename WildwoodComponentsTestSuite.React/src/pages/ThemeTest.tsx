import { useTheme } from '@wildwood/react';
import type { ThemeName } from '@wildwood/core';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

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
    <ComponentTestPage
      title="Theme Component"
      description="Tests theme switching and CSS variable propagation."
    >
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
    </ComponentTestPage>
  );
}
