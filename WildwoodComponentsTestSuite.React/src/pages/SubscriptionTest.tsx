import { useState } from 'react';
import { SubscriptionComponent, SubscriptionManagerComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function SubscriptionTest() {
  const [showManager, setShowManager] = useState(false);
  const [autoLoad, setAutoLoad] = useState(true);
  const [showPlanSelector, setShowPlanSelector] = useState(true);

  return (
    <ComponentTestPage
      title="Subscription Component"
      description="View plans, subscribe, change plans, and manage subscriptions."
      settings={{
        showManager: { type: 'boolean', value: showManager },
        autoLoad: { type: 'boolean', value: autoLoad },
        showPlanSelector: { type: 'boolean', value: showPlanSelector },
      }}
      onSettingChange={(key, value) => {
        if (key === 'showManager') setShowManager(value as boolean);
        if (key === 'autoLoad') setAutoLoad(value as boolean);
        if (key === 'showPlanSelector') setShowPlanSelector(value as boolean);
      }}
    >
      {showManager ? (
        <SubscriptionManagerComponent
          autoLoad={autoLoad}
          showPlanSelector={showPlanSelector}
          onSubscriptionChange={(sub) => console.log('Subscription changed:', sub)}
        />
      ) : (
        <SubscriptionComponent
          autoLoad={autoLoad}
          onSubscriptionChange={() => console.log('Subscription changed')}
        />
      )}
    </ComponentTestPage>
  );
}
