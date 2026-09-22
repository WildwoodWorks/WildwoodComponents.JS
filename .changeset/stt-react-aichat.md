---
"@wildwood/react": minor
---

`AIChatComponent`: voice input actually works

`settings.enableSpeechToText` was a stub — the prop existed, a listening flag existed, and nothing
ever started recognition. There is now a mic button beside Send that records what you say and puts
it in the chat input, matching the Blazor component's behaviour.

It picks its mechanism once, on the client, per browser:

| Mode | When | What happens |
|---|---|---|
| `native` | the Web Speech API exists (Chrome, Edge, Safari with dictation on) | live recognition, interim words shown while you speak, nothing leaves the machine |
| `recorder` | only `getUserMedia` + `MediaRecorder` exist (Firefox, Brave/Opera/Vivaldi, WebView2) | records a clip and transcribes it with `transcribeAudio`, using the chat's active AI configuration |
| `none` | neither exists | **no mic button renders** — the control is never dead |

A native session that fails with `network`, `service-not-allowed` or `language-not-supported` means
the engine exposes recognition without a backend, so the component downgrades to `recorder` for the
rest of its life and carries straight on into a recording: the tap that hit the dead button still
records what you were saying. Other failures (`no-speech`, `aborted`) are left alone. A browser with
recognition but no `MediaRecorder` has nothing to downgrade **to**, so it lands in `none` and the
button disappears rather than reporting "unsupported" on every tap.

The mic button is disabled while the browser's microphone-permission prompt is open, and a second
`start()` in that window is refused outright — a double-tap opens one recording, not two. A `stop()`
or an unmount during the prompt releases the stream the browser grants late instead of recording
into nothing.

Recorded clips are capped at **60 seconds** (the recorder stops itself and transcribes) and
**25 MB** (refused with a message rather than posted). The container is the first of
`audio/webm;codecs=opus`, `audio/ogg;codecs=opus`, `audio/mp4`, `audio/webm` that the browser will
record. Every failure — a refused microphone, a server refusal, an unsupported browser — surfaces in
the chat's existing non-blocking banner, and the microphone is released on stop, on error and on
unmount.

```tsx
<AIChatComponent settings={{ enableSpeechToText: true }} />
```

Nothing else about the chat changed, and there is no new required prop. The logic lives in a
`useSpeechInput` hook next to the component; it reads no browser API at module scope or during
render, so the package stays server-renderable (the button appears on hydration).

React Native is unaffected: `enableSpeechToText` is still accepted there and still renders no mic
button — native audio capture needs a host module and permission strings this package cannot ship.
Record in the host app and call `useAI().transcribeAudio(blob, mimeType)` yourself.
