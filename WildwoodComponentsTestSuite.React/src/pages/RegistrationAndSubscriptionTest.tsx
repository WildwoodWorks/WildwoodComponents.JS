import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RegistrationAndSubscriptionComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

/**
 * The four surfaces of RegistrationAndSubscriptionComponent: its three views plus the invite
 * preset (the signup view with tokenMode="required").
 *
 * The app under test comes from `?appId=` when the URL carries one, else VITE_APP_ID, and can be
 * typed into the settings panel. The query parameter is what lets an end-to-end run point the page
 * at a mocked catalog without an .env file. `?view=` picks the surface the same way.
 */
type TestView = 'pricing' | 'signup' | 'manage' | 'invite';

const VIEWS: TestView[] = ['pricing', 'signup', 'manage', 'invite'];

const VIEW_LABELS: Record<TestView, string> = {
  pricing: 'Pricing',
  signup: 'Signup',
  manage: 'Manage',
  invite: 'Invite (token required)',
};

function isTestView(value: string | null): value is TestView {
  return value !== null && (VIEWS as string[]).includes(value);
}

export function RegistrationAndSubscriptionTest() {
  const [params] = useSearchParams();

  const [view, setView] = useState<TestView>(() => {
    const requested = params.get('view');
    return isTestView(requested) ? requested : 'pricing';
  });
  const [appId, setAppId] = useState(() => params.get('appId') || import.meta.env.VITE_APP_ID || '');
  const [registrationToken, setRegistrationToken] = useState(() => params.get('token') || params.get('invite') || '');
  const [planSelection, setPlanSelection] = useState<string>('choose');
  const [packSelection, setPackSelection] = useState<string>('multi');
  const [tokenMode, setTokenMode] = useState<string>('auto');
  const [showAddOns, setShowAddOns] = useState(true);
  const [allowPackSelfService, setAllowPackSelfService] = useState(true);
  const [layout, setLayout] = useState<string>('tabs');
  const [eventLog, setEventLog] = useState<string[]>([]);

  const log = (message: string, payload?: unknown) =>
    setEventLog((prev) =>
      [
        `[${new Date().toLocaleTimeString()}] ${message}${payload === undefined ? '' : ` ${JSON.stringify(payload)}`}`,
        ...prev,
      ].slice(0, 50),
    );

  const common = {
    appId: appId || undefined,
    contactUrl: '/contact',
    onError: (error: { code: string; message: string }) => log('onError', error),
  };

  return (
    <ComponentTestPage
      title="Registration & Subscription Component"
      description="Pricing, signup and subscription management in one component. Prices come from the app's live public catalog; the signup form's options come from its live authentication settings."
      settings={{
        appId: { type: 'text', value: appId },
        registrationToken: { type: 'text', value: registrationToken },
        planSelection: { type: 'select', value: planSelection, options: ['choose', 'skip'] },
        packSelection: { type: 'select', value: packSelection, options: ['multi', 'none'] },
        tokenMode: { type: 'select', value: tokenMode, options: ['auto', 'required'] },
        showAddOns: { type: 'boolean', value: showAddOns },
        allowPackSelfService: { type: 'boolean', value: allowPackSelfService },
        layout: { type: 'select', value: layout, options: ['tabs', 'stacked'] },
      }}
      onSettingChange={(key, value) => {
        if (key === 'appId') setAppId(value as string);
        if (key === 'registrationToken') setRegistrationToken(value as string);
        if (key === 'planSelection') setPlanSelection(value as string);
        if (key === 'packSelection') setPackSelection(value as string);
        if (key === 'tokenMode') setTokenMode(value as string);
        if (key === 'showAddOns') setShowAddOns(value as boolean);
        if (key === 'allowPackSelfService') setAllowPackSelfService(value as boolean);
        if (key === 'layout') setLayout(value as string);
      }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {VIEWS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            data-ww-test-view={candidate}
            onClick={() => setView(candidate)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--ww-border, #ccc)',
              background: view === candidate ? 'var(--ww-primary, #3182ce)' : 'transparent',
              color: view === candidate ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {VIEW_LABELS[candidate]}
          </button>
        ))}
      </div>

      {view === 'pricing' && (
        <RegistrationAndSubscriptionComponent
          {...common}
          view="pricing"
          showAddOns={showAddOns}
          packSelection={packSelection === 'none' ? 'none' : 'multi'}
          addOnGroups={
            showAddOns
              ? [
                  { id: 'content', title: 'Content', categories: ['Content', 'Documents'] },
                  { id: 'analytics', title: 'Analytics', categories: ['Analytics', 'Insights'] },
                ]
              : undefined
          }
          includeJsonLd
          onSelect={(selection) => log('onSelect', selection)}
        />
      )}

      {view === 'signup' && (
        <RegistrationAndSubscriptionComponent
          {...common}
          view="signup"
          registrationToken={registrationToken || undefined}
          planSelection={planSelection === 'skip' ? 'skip' : 'choose'}
          packSelection={packSelection === 'none' ? 'none' : 'multi'}
          tokenMode={tokenMode === 'required' ? 'required' : 'auto'}
          onSignupComplete={(outcome) => log('onSignupComplete', outcome)}
          onEntitlementsChanged={(reason) => log('onEntitlementsChanged', reason)}
          onAlreadySignedIn={() => log('onAlreadySignedIn')}
          onCancel={() => log('onCancel')}
        />
      )}

      {view === 'invite' && (
        <RegistrationAndSubscriptionComponent
          {...common}
          view="signup"
          tokenMode="required"
          registrationToken={registrationToken || undefined}
          prefillEmail={params.get('email') || undefined}
          planSelection="skip"
          packSelection="none"
          onSignupComplete={(outcome) => log('onSignupComplete', outcome)}
          onEntitlementsChanged={(reason) => log('onEntitlementsChanged', reason)}
          onCancel={() => log('onCancel')}
        />
      )}

      {view === 'manage' && (
        <RegistrationAndSubscriptionComponent
          {...common}
          view="manage"
          layout={layout === 'stacked' ? 'stacked' : 'tabs'}
          showStatusAboveTabs
          showAddOns={showAddOns}
          allowPackSelfService={allowPackSelfService}
          onSubscriptionChanged={() => log('onSubscriptionChanged')}
          onEntitlementsChanged={(reason) => log('onEntitlementsChanged', reason)}
        />
      )}

      <div className="status-card" style={{ marginTop: 16 }}>
        <h3>Event Log</h3>
        {eventLog.length === 0 ? (
          <p style={{ fontSize: 12 }}>
            onSelect, onSignupComplete, onEntitlementsChanged and onError payloads appear here.
          </p>
        ) : (
          <div style={{ maxHeight: 220, overflow: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
            {eventLog.map((entry, index) => (
              <div key={index}>{entry}</div>
            ))}
          </div>
        )}
      </div>
    </ComponentTestPage>
  );
}
