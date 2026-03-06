import type { ReactNode } from 'react';
import { DebugPanel } from './DebugPanel';
import { SettingsPanel } from './SettingsPanel';
import type { SettingsPanelProps } from './SettingsPanel';

export interface ComponentTestPageProps {
  title: string;
  description: string;
  children: ReactNode;
  settings?: SettingsPanelProps['settings'];
  onSettingChange?: SettingsPanelProps['onSettingChange'];
}

/**
 * Wrapper for test pages. Provides consistent layout with title, description,
 * component area, settings panel, and debug panel.
 */
export function ComponentTestPage({
  title,
  description,
  children,
  settings,
  onSettingChange,
}: ComponentTestPageProps) {
  return (
    <div className="page component-test-page">
      <h1>{title}</h1>
      <p>{description}</p>

      <SettingsPanel settings={settings} onSettingChange={onSettingChange} />

      <div className="component-container">
        {children}
      </div>

      <DebugPanel />
    </div>
  );
}
