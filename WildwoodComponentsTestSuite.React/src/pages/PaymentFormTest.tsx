import { useState } from 'react';
import { PaymentFormComponent } from '@wildwood/react';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function PaymentFormTest() {
  const [providerId, setProviderId] = useState('');
  const [appId, setAppId] = useState('');
  const [amount, setAmount] = useState(9.99);
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('Test payment');
  const [customerId, setCustomerId] = useState('');
  const [eventLog, setEventLog] = useState<string[]>([]);

  const log = (msg: string) =>
    setEventLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  return (
    <ComponentTestPage
      title="Payment Form Component"
      description="A dedicated payment form for initiating payments with a pre-set amount."
      settings={{
        providerId: { type: 'text', value: providerId },
        appId: { type: 'text', value: appId },
        amount: { type: 'text', value: String(amount) },
        currency: { type: 'text', value: currency },
        description: { type: 'text', value: description },
        customerId: { type: 'text', value: customerId },
      }}
      onSettingChange={(key, value) => {
        if (key === 'providerId') setProviderId(value as string);
        if (key === 'appId') setAppId(value as string);
        if (key === 'amount') setAmount(Number(value) || 0);
        if (key === 'currency') setCurrency(value as string);
        if (key === 'description') setDescription(value as string);
        if (key === 'customerId') setCustomerId(value as string);
      }}
    >
      <PaymentFormComponent
        providerId={providerId}
        appId={appId}
        amount={amount}
        currency={currency || 'USD'}
        description={description || undefined}
        customerId={customerId || undefined}
        onPaymentSuccess={(response) => {
          log(`Payment success: transactionId=${response.transactionId ?? 'N/A'}`);
          console.log('Payment success:', response);
        }}
        onPaymentError={(errorMsg) => {
          log(`Payment error: ${errorMsg}`);
          console.log('Payment error:', errorMsg);
        }}
      />

      {eventLog.length > 0 && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Event Log</h3>
          <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
            {eventLog.map((entry, i) => (
              <div key={i}>{entry}</div>
            ))}
          </div>
        </div>
      )}
    </ComponentTestPage>
  );
}
