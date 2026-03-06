import { SecureMessagingComponent } from '@wildwood/react';

export function MessagingTest() {
  return (
    <div className="page">
      <h1>Secure Messaging</h1>
      <p>Thread-based messaging with reactions, editing, and search.</p>

      <SecureMessagingComponent
        onThreadSelected={(thread) => console.log('Thread selected:', thread)}
      />
    </div>
  );
}
