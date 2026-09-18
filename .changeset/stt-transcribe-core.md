---
"@wildwood/core": minor
"@wildwood/react-shared": minor
"@wildwood/react": patch
"@wildwood/react-native": patch
---

Speech-to-text: `transcribeAudio` sends a recorded clip to the server

`client.ai.transcribeAudio(audio, contentType?, configurationId?, language?)` posts a recorded
clip to `api/stt/transcribe` and answers a `SpeechTranscriptionResult` — the port of Blazor's
`AIService.TranscribeAudioAsync`, matching it on the wire. The multipart body names the file part
`file` with a `speech.<ext>` filename taken from the webm/ogg/mp4/m4a/mp3/wav map, and the part
carries the bare media type: `audio/webm;codecs=opus` is sent as `audio/webm`, because the server's
provider reads the container from the file name and ignores codec parameters. `configurationId` and
`language` are sent only when they have a value, and `contentType` defaults to the blob's own type,
so a `MediaRecorder` chunk can be passed straight through.

```ts
const { success, text, errorMessage } = await client.ai.transcribeAudio(blob, blob.type);
```

It never rejects. An empty clip answers `No audio was recorded.` without a request; a server refusal
carries the server's own message, or the status code when it sent none; a network failure or timeout
answers `Transcription failed. Please try again.` — so a recorder UI can render the result without a
try/catch. `useAI()` exposes the same method (React and React Native both re-export it), and
`SpeechTranscriptionResult` is exported from all three packages.

This is the transport only. Wiring it to a microphone in `AIChatComponent` follows separately;
React Native has no voice input.
