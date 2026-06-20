import { useState } from 'react';
import { ConsentBanner } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function ConsentTest() {
  const [showReopen, setShowReopen] = useState(true);

  const clearCookie = () => {
    document.cookie = 'ww_consent=; Max-Age=0; Path=/';
    location.reload();
  };

  return (
    <ComponentTestPage
      title="Consent Banner"
      description="Block-before-consent cookie banner: no gated script loads until its category is consented to. Honors GPC and exposes the CCPA opt-out surfaces."
      settings={{
        showReopenLink: { type: 'boolean', value: showReopen },
      }}
      onSettingChange={(key, value) => {
        if (key === 'showReopenLink') setShowReopen(value as boolean);
      }}
    >
      <div className="status-card" style={{ marginBottom: 16 }}>
        <h3>How to test</h3>
        <p>
          Open the Network tab and confirm no analytics/pixel request fires before you click Accept. Reject loads only
          Strictly Necessary; Accept loads all enabled categories.
        </p>
        <button className="btn btn-secondary" onClick={clearCookie}>
          Clear consent cookie &amp; reload
        </button>
      </div>

      <ConsentBanner showReopenLink={showReopen} className="consent-test-host" />
    </ComponentTestPage>
  );
}
