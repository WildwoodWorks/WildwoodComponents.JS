import { useState } from 'react';
import { FeedbackComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function FeedbackTest() {
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [showLauncher, setShowLauncher] = useState(true);
  const [open, setOpen] = useState(false);
  const [lastSubmittedId, setLastSubmittedId] = useState<string | null>(null);

  const appId = import.meta.env.VITE_APP_ID || '';

  return (
    <ComponentTestPage
      title="Feedback Component"
      description="Floating feedback widget: choose a type, add a title/description, optionally capture a screenshot or attach files, and submit. Recent console errors/warnings are attached automatically. Works for anonymous and authenticated users."
      settings={{
        position: { type: 'select', value: position, options: ['bottom-right', 'bottom-left'] },
        showLauncher: { type: 'boolean', value: showLauncher },
      }}
      onSettingChange={(key, value) => {
        if (key === 'position') setPosition(value as 'bottom-right' | 'bottom-left');
        if (key === 'showLauncher') setShowLauncher(value as boolean);
      }}
    >
      <div className="status-card">
        <h3>Try it</h3>
        <p>
          The floating feedback button appears in the {position} corner of the screen. Click it (or the button below) to
          open the form.
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close feedback panel' : 'Open feedback panel'}
        </button>
        {lastSubmittedId && (
          <p style={{ marginTop: 12 }}>
            Last submitted feedback id: <code>{lastSubmittedId}</code>
          </p>
        )}
      </div>

      <FeedbackComponent
        appId={appId}
        position={position}
        showLauncher={showLauncher}
        open={open}
        onOpenChange={setOpen}
        onSubmitted={(id) => {
          setLastSubmittedId(id);
          console.log('Feedback submitted', id);
        }}
      />
    </ComponentTestPage>
  );
}
