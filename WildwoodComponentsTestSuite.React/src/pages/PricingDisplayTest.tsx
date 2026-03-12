import { useState } from 'react';
import { PricingDisplayComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function PricingDisplayTest() {
  const [showBillingToggle, setShowBillingToggle] = useState(true);
  const [showFeatureComparison, setShowFeatureComparison] = useState(true);
  const [showLimits, setShowLimits] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  return (
    <ComponentTestPage
      title="Pricing Display Component"
      description="Public-facing pricing grid. No authentication required — fetches tiers via the public endpoint."
      settings={{
        showBillingToggle: { type: 'boolean', value: showBillingToggle },
        showFeatureComparison: { type: 'boolean', value: showFeatureComparison },
        showLimits: { type: 'boolean', value: showLimits },
      }}
      onSettingChange={(key, value) => {
        if (key === 'showBillingToggle') setShowBillingToggle(value as boolean);
        if (key === 'showFeatureComparison') setShowFeatureComparison(value as boolean);
        if (key === 'showLimits') setShowLimits(value as boolean);
      }}
    >
      <PricingDisplayComponent
        title="Choose Your Plan"
        subtitle="Get started with the plan that fits your needs"
        showBillingToggle={showBillingToggle}
        showFeatureComparison={showFeatureComparison}
        showLimits={showLimits}
        enterpriseContactUrl="#contact"
        onSelectTier={(tier) => {
          setSelectedTier(tier.id ?? tier.name ?? 'unknown');
          console.log('Tier selected:', tier);
        }}
      />

      {selectedTier && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Tier Selected</h3>
          <dl>
            <dt>Tier ID</dt>
            <dd style={{ fontSize: 12 }}>{selectedTier}</dd>
          </dl>
        </div>
      )}
    </ComponentTestPage>
  );
}
