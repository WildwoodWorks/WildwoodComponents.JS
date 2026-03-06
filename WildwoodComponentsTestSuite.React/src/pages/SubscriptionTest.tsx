import { SubscriptionComponent } from '@wildwood/react';

export function SubscriptionTest() {
  return (
    <div className="page">
      <h1>Subscription Component</h1>
      <p>View plans, subscribe, change plans, and manage subscriptions.</p>

      <SubscriptionComponent
        onSubscriptionChange={() => console.log('Subscription changed')}
      />
    </div>
  );
}
