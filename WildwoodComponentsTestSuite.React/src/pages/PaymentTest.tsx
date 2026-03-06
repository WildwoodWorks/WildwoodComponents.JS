import { PaymentComponent } from '@wildwood/react';

export function PaymentTest() {
  return (
    <div className="page">
      <h1>Payment Component</h1>
      <p>Manage payment methods and initiate payments.</p>

      <PaymentComponent
        onPaymentComplete={(paymentId) => console.log('Payment complete:', paymentId)}
      />
    </div>
  );
}
