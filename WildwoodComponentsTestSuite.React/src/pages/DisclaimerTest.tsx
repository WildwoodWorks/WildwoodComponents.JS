import { useState } from 'react';
import { DisclaimerComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function DisclaimerTest() {
  const [autoLoad, setAutoLoad] = useState(true);
  const [allAccepted, setAllAccepted] = useState(false);

  return (
    <ComponentTestPage
      title="Disclaimer Component"
      description="View and accept pending disclaimers with HTML content support."
      settings={{
        autoLoad: { type: 'boolean', value: autoLoad },
      }}
      onSettingChange={(key, value) => {
        if (key === 'autoLoad') setAutoLoad(value as boolean);
      }}
    >
      <DisclaimerComponent
        autoLoad={autoLoad}
        onAllAccepted={() => {
          setAllAccepted(true);
          console.log('All disclaimers accepted');
        }}
      />

      {allAccepted && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Status</h3>
          <p>All disclaimers have been accepted.</p>
        </div>
      )}
    </ComponentTestPage>
  );
}
