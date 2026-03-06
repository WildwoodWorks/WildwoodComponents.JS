import { useState } from 'react';

export interface SettingsPanelProps {
  settings?: Record<string, { type: 'text' | 'boolean' | 'select'; value: string | boolean; options?: string[] }>;
  onSettingChange?: (key: string, value: string | boolean) => void;
}

export function SettingsPanel({ settings, onSettingChange }: SettingsPanelProps) {
  const [collapsed, setCollapsed] = useState(true);

  if (!settings || Object.keys(settings).length === 0) return null;

  if (collapsed) {
    return (
      <div className="settings-panel settings-panel-collapsed">
        <button type="button" onClick={() => setCollapsed(false)}>
          Settings ({Object.keys(settings).length})
        </button>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h4>Component Settings</h4>
        <button type="button" className="dismiss-btn" onClick={() => setCollapsed(true)}>
          Collapse
        </button>
      </div>
      <div className="settings-body">
        {Object.entries(settings).map(([key, setting]) => (
          <div key={key} className="settings-field">
            <label>{key}</label>
            {setting.type === 'boolean' ? (
              <input
                type="checkbox"
                checked={setting.value as boolean}
                onChange={(e) => onSettingChange?.(key, e.target.checked)}
              />
            ) : setting.type === 'select' && setting.options ? (
              <select
                value={setting.value as string}
                onChange={(e) => onSettingChange?.(key, e.target.value)}
              >
                {setting.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={setting.value as string}
                onChange={(e) => onSettingChange?.(key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
