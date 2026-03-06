import { DisclaimerComponent } from '@wildwood/react';

export function DisclaimerTest() {
  return (
    <div className="page">
      <h1>Disclaimer Component</h1>
      <p>View and accept pending disclaimers.</p>

      <DisclaimerComponent
        onAllAccepted={() => console.log('All disclaimers accepted')}
      />
    </div>
  );
}
