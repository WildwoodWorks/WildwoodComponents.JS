import { AppTierComponent } from '@wildwood/react';

export function AppTierTest() {
  return (
    <div className="page">
      <h1>App Tier Component</h1>
      <p>Browse tiers, view current subscription, and change plans.</p>

      <AppTierComponent
        onTierChanged={(tierId) => console.log('Tier changed to:', tierId)}
      />
    </div>
  );
}
