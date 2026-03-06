import { useState } from 'react';
import { PaymentComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function PaymentTest() {
  const [customerId, setCustomerId] = useState('');
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  return (
    <ComponentTestPage
      title="Payment Component"
      description="Manage payment methods, add/remove cards, and initiate payments."
      settings={{
        customerId: { type: 'text', value: customerId },
      }}
      onSettingChange={(key, value) => {
        if (key === 'customerId') setCustomerId(value as string);
      }}
    >
      <PaymentComponent
        customerId={customerId || undefined}
        onPaymentComplete={(paymentId) => {
          setLastPaymentId(paymentId);
          console.log('Payment complete:', paymentId);
        }}
      />

      {lastPaymentId && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Last Payment</h3>
          <dl>
            <dt>Payment Intent ID</dt>
            <dd style={{ fontSize: 12 }}>{lastPaymentId}</dd>
          </dl>
        </div>
      )}
    </ComponentTestPage>
  );
}
