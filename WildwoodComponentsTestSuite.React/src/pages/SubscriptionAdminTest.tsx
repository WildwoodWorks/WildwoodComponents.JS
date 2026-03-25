import { useState } from 'react';
import { SubscriptionAdminComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function SubscriptionAdminTest() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [selfService, setSelfService] = useState(false);
  const [showStatusAboveTabs, setShowStatusAboveTabs] = useState(true);
  const [showBillingToggle, setShowBillingToggle] = useState(true);
  const [displayMode, setDisplayMode] = useState<string>('tabs');
  const [userId, setUserId] = useState('');
  const [companyId, setCompanyId] = useState('');

  const appId = import.meta.env.VITE_APP_ID || '';

  return (
    <ComponentTestPage
      title="Subscription Admin Component"
      description="Full admin interface for subscription management: status, tier plans, features, add-ons, usage limits, and feature overrides."
      settings={{
        isAdmin: { type: 'boolean', value: isAdmin },
        selfService: { type: 'boolean', value: selfService },
        showStatusAboveTabs: { type: 'boolean', value: showStatusAboveTabs },
        showBillingToggle: { type: 'boolean', value: showBillingToggle },
        displayMode: {
          type: 'select',
          value: displayMode,
          options: ['tabs', 'subscription', 'tiers', 'features', 'usage', 'overrides'],
        },
        userId: { type: 'text', value: userId },
        companyId: { type: 'text', value: companyId },
      }}
      onSettingChange={(key, value) => {
        if (key === 'isAdmin') setIsAdmin(value as boolean);
        if (key === 'selfService') setSelfService(value as boolean);
        if (key === 'showStatusAboveTabs') setShowStatusAboveTabs(value as boolean);
        if (key === 'showBillingToggle') setShowBillingToggle(value as boolean);
        if (key === 'displayMode') setDisplayMode(value as string);
        if (key === 'userId') setUserId(value as string);
        if (key === 'companyId') setCompanyId(value as string);
      }}
    >
      <SubscriptionAdminComponent
        appId={appId}
        isAdmin={isAdmin}
        selfService={selfService}
        showStatusAboveTabs={showStatusAboveTabs}
        showBillingToggle={showBillingToggle}
        displayMode={displayMode as 'tabs' | 'subscription' | 'tiers' | 'features' | 'usage' | 'overrides'}
        userId={userId || undefined}
        companyId={companyId || undefined}
        currency="USD"
        onSubscriptionChanged={() => console.log('Subscription changed')}
      />
    </ComponentTestPage>
  );
}
