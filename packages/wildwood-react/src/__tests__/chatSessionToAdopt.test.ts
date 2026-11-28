import { describe, it, expect } from 'vitest';
import { chatSessionToAdopt } from '@wildwood/react-shared';

// Chat follows the session the server names, as Blazor (AIChatComponent.Messages.cs) and Swift
// (WildwoodChatModel) do: the server is the authority on where a message landed.
describe('chatSessionToAdopt', () => {
  it('adopts the server’s session when none is tracked', () => {
    expect(chatSessionToAdopt('', 's-1')).toBe('s-1');
    expect(chatSessionToAdopt(undefined, 's-1')).toBe('s-1');
  });

  it('adopts a different session the server moved the conversation to', () => {
    expect(chatSessionToAdopt('s-1', 's-2')).toBe('s-2');
  });

  it('keeps the tracked session when the response repeats it or names none', () => {
    expect(chatSessionToAdopt('s-1', 's-1')).toBeNull();
    expect(chatSessionToAdopt('s-1', undefined)).toBeNull();
    expect(chatSessionToAdopt('s-1', '')).toBeNull();
    expect(chatSessionToAdopt('', null)).toBeNull();
  });
});
