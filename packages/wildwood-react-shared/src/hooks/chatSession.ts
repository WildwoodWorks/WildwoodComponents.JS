/**
 * The session id a chat response asks the component to switch to, or null to keep the one it has.
 *
 * The server is the authority on which session a message landed in: when a response names a session
 * different from the tracked one (a new session, or the server moving the conversation), adopt it —
 * otherwise every later message keeps going to a session the server no longer uses. Blazor and Swift
 * have always done this; React, React Native and Razor used to adopt only when nothing was tracked.
 */
export function chatSessionToAdopt(
  tracked: string | null | undefined,
  fromResponse: string | null | undefined,
): string | null {
  if (!fromResponse) return null;
  return fromResponse === tracked ? null : fromResponse;
}
