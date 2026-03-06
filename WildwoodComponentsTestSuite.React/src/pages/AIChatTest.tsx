import { AIChatComponent } from '@wildwood/react';

export function AIChatTest() {
  return (
    <div className="page">
      <h1>AI Chat Component</h1>
      <p>Interactive AI chat with session management.</p>

      <AIChatComponent
        configurationName="default"
        showSessionList={true}
        onMessageReceived={(resp) => console.log('AI response:', resp)}
      />
    </div>
  );
}
