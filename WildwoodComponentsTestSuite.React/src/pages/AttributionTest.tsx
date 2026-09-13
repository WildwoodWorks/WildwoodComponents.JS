import { useState } from 'react';
import { useAttribution } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

const SAMPLE_URL =
  'https://cairnfed.ai/?utm_source=reddit&utm_medium=paid&utm_campaign=govcon-test-sep26&utm_content=ad1';

function describeTouch(touch: { source: string | null; medium: string | null; campaign: string | null } | null) {
  if (!touch) return 'none';
  return `${touch.source ?? '(none)'} / ${touch.medium ?? '(none)'} / ${touch.campaign ?? '(none)'}`;
}

export function AttributionTest() {
  const [showPayload, setShowPayload] = useState(true);
  const [url, setUrl] = useState(SAMPLE_URL);
  const [referrer, setReferrer] = useState('');
  const { state, touch, isPersisted, captureUrl, getForRegistration, clear } = useAttribution();
  const payload = getForRegistration();

  return (
    <ComponentTestPage
      title="Campaign Attribution"
      description="Captures UTM tags, an ad click id and the referrer from the landing URL, keeps a first and a last touch, persists them only once consent allows it, and attaches them to every signup."
      settings={{
        showPayload: { type: 'boolean', value: showPayload },
      }}
      onSettingChange={(key, value) => {
        if (key === 'showPayload') setShowPayload(value as boolean);
      }}
    >
      <div className="status-card" style={{ marginBottom: 16 }}>
        <h3>How to test</h3>
        <p>
          Open this page with UTM tags in the address bar, or capture a tagged URL below. Touches stay in memory until
          the app&apos;s consent category is granted; then they are written to localStorage under{' '}
          <code>ww_attribution</code>. The app must have Campaign Attribution enabled in WildwoodAdmin for the config to
          load.
        </p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          URL
          <input style={{ display: 'block', width: '100%' }} value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Referrer (optional)
          <input
            style={{ display: 'block', width: '100%' }}
            value={referrer}
            onChange={(e) => setReferrer(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" onClick={() => captureUrl(url, referrer || null)}>
          Capture URL
        </button>{' '}
        <button className="btn btn-secondary" onClick={clear}>
          Clear touches
        </button>
      </div>

      <div className="status-card">
        <h3>State</h3>
        <p>
          Visitor key: <code>{state.visitorKey}</code>
        </p>
        <p>
          App config:{' '}
          {state.config
            ? state.config.isEnabled
              ? 'attribution enabled'
              : 'attribution disabled for this app'
            : 'not loaded'}
        </p>
        <p>Persisted: {isPersisted ? 'yes' : 'no (memory only until consent allows it)'}</p>
        <p>First touch: {describeTouch(state.first)}</p>
        <p>Last touch: {describeTouch(touch)}</p>
        {showPayload && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(payload, null, 2)}</pre>}
      </div>
    </ComponentTestPage>
  );
}
