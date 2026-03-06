import { useState } from 'react';
import { AIChatComponent } from '@wildwood/react';
import type { AIChatResponse } from '@wildwood/core';
import { ComponentTestPage } from '../components/shared/ComponentTestPage';

export function AIChatTest() {
  const [configurationName, setConfigurationName] = useState('default');
  const [showSessionList, setShowSessionList] = useState(true);
  const [placeholder, setPlaceholder] = useState('Type a message...');
  const [lastResponse, setLastResponse] = useState<AIChatResponse | null>(null);

  return (
    <ComponentTestPage
      title="AI Chat Component"
      description="Interactive AI chat with session management, message history, and TTS."
      settings={{
        configurationName: { type: 'text', value: configurationName },
        showSessionList: { type: 'boolean', value: showSessionList },
        placeholder: { type: 'text', value: placeholder },
      }}
      onSettingChange={(key, value) => {
        if (key === 'configurationName') setConfigurationName(value as string);
        if (key === 'showSessionList') setShowSessionList(value as boolean);
        if (key === 'placeholder') setPlaceholder(value as string);
      }}
    >
      <AIChatComponent
        configurationName={configurationName}
        showSessionList={showSessionList}
        placeholder={placeholder}
        onMessageReceived={(resp) => {
          setLastResponse(resp);
          console.log('AI response:', resp);
        }}
      />

      {lastResponse && (
        <div className="status-card" style={{ marginTop: 16 }}>
          <h3>Last Response</h3>
          <dl>
            <dt>Response</dt>
            <dd style={{ maxHeight: 100, overflow: 'auto' }}>{lastResponse.response}</dd>
            {lastResponse.tokensUsed != null && (
              <>
                <dt>Tokens Used</dt>
                <dd>{lastResponse.tokensUsed}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </ComponentTestPage>
  );
}
