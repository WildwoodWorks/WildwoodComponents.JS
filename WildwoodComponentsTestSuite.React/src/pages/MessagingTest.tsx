import { useState } from 'react';
import { SecureMessagingComponent } from '@wildwood/react';
import type { MessageThread } from '@wildwood/core';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function MessagingTest() {
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);

  return (
    <ComponentTestPage
      title="Secure Messaging"
      description="Thread-based messaging with reactions, editing, typing indicators, and search."
    >
      <SecureMessagingComponent
        onThreadSelected={(thread) => {
          setSelectedThread(thread);
          console.log('Thread selected:', thread);
        }}
      />

      {selectedThread && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Selected Thread</h3>
          <dl>
            <dt>Thread ID</dt>
            <dd style={{ fontSize: 12 }}>{selectedThread.id}</dd>
            <dt>Subject</dt>
            <dd>{selectedThread.subject || '(none)'}</dd>
            <dt>Participants</dt>
            <dd>{selectedThread.participants.length}</dd>
            <dt>Unread</dt>
            <dd>{selectedThread.unreadCount}</dd>
          </dl>
        </div>
      )}
    </ComponentTestPage>
  );
}
