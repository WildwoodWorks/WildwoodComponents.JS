// Browser voice input for AIChatComponent — the React port of Blazor's
// AIChatComponent.SpeechToText.cs + AIChatComponent.SpeechRecorder.cs and the speech half of
// WildwoodComponents.Blazor/wwwroot/js/ai-chat.js.
//
// Two mechanisms behind one mic button, picked once per mount:
//
//   'native'   the Web Speech API (Chrome, Edge, Safari with dictation on). Live interim results,
//              no server call, no audio leaves the machine.
//   'recorder' MediaRecorder + `transcribeAudio` (Firefox, Brave/Opera/Vivaldi, WebView2, Safari
//              with dictation off). One server call per clip, so it only ever records on an
//              explicit request — never on its own.
//   'none'     neither is available; the caller renders no mic button at all.
//
// A native session can also fail at RUNTIME in an engine that merely EXPOSES the Web Speech API
// without a recognition backend: `network`, `service-not-allowed` and `language-not-supported` all
// mean "this will never work here". Those three downgrade the hook to 'recorder' for the rest of
// its life and, like Blazor, carry straight on into a recording, so the tap that hit the dead
// button still records what the user is saying — unless this browser has no recorder to downgrade
// TO, in which case the honest answer is 'none' and the button goes away.
//
// SSR: nothing here touches `window`, `navigator` or `MediaRecorder` at module scope or during
// render. Detection runs in a mount effect, so the server and the first client render agree (mode
// 'none', no mic button) and the button appears on hydration.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechTranscriptionResult } from '@wildwood/core';

export type SpeechInputMode = 'native' | 'recorder' | 'none';

/** Longest clip the recorder captures before it stops itself and transcribes. */
export const MAX_RECORDING_SECONDS = 60;

/** Upper bound on a recorded clip — the server's transcription limit. */
export const MAX_RECORDING_BYTES = 25 * 1024 * 1024;

/**
 * First container the browser can record, most to least preferred:
 * Chrome/Edge -> webm/opus, Firefox -> webm or ogg, Safari -> mp4.
 */
export const RECORDING_MIME_PREFERENCE: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/webm',
];

/** Web Speech error codes that mean "recognition will never run here" — see the file header. */
const DOWNGRADE_ERROR_CODES: ReadonlySet<string> = new Set([
  'network',
  'service-not-allowed',
  'language-not-supported',
]);

/** Ordinary ends of a session, not failures: nothing was said, or we stopped it ourselves. */
const SILENT_ERROR_CODES: ReadonlySet<string> = new Set(['no-speech', 'aborted']);

/** 'stop' normally follows within milliseconds; this only exists so a caller never hangs. */
const STOP_EVENT_TIMEOUT_MS = 3000;

/** Chunk interval. Chunking is what lets the size cap be enforced DURING a recording. */
const RECORDER_TIMESLICE_MS = 1000;

const MESSAGES = {
  unsupported: "Voice input isn't supported in this browser.",
  permissionDenied: 'Microphone permission was denied. Please enable microphone access to use voice input.',
  noMicrophone: 'No microphone was found on this device.',
  microphoneBusy: 'The microphone is in use by another application. Close it and try again.',
  tooLarge: `Voice input is limited to ${MAX_RECORDING_BYTES / (1024 * 1024)} MB. Please record a shorter clip.`,
  transcriptionFailed: 'Transcription failed. Please try again.',
  processingFailed: 'Voice input could not be processed. Please try again.',
} as const;

// ---------------------------------------------------------------------------------------------
// Minimal shapes for the browser speech APIs.
//
// Declared here rather than taken from lib.dom because SpeechRecognition's presence there varies
// by TypeScript version, and this package must compile against the ones consumers pin. Only the
// members actually used are modelled.
// ---------------------------------------------------------------------------------------------

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternativeLike | undefined;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike | undefined };
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechGlobals {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  MediaRecorder?: typeof MediaRecorder;
  navigator?: Navigator;
}

/** Every browser lookup goes through here, so nothing in this file reads a global directly. */
function browser(): SpeechGlobals {
  return globalThis as unknown as SpeechGlobals;
}

function speechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const globals = browser();
  return globals.SpeechRecognition ?? globals.webkitSpeechRecognition;
}

function recorderSupported(): boolean {
  const globals = browser();
  const mediaDevices = globals.navigator?.mediaDevices;
  return typeof globals.MediaRecorder !== 'undefined' && typeof mediaDevices?.getUserMedia === 'function';
}

/**
 * Which voice input this browser can do. Client-only: call it from an effect or an event handler,
 * never during render.
 */
export function detectSpeechInputMode(): SpeechInputMode {
  if (speechRecognitionCtor()) return 'native';
  if (recorderSupported()) return 'recorder';
  return 'none';
}

/**
 * The first container in {@link RECORDING_MIME_PREFERENCE} the browser will record, or `''` to let
 * MediaRecorder choose (older implementations have no `isTypeSupported`).
 */
export function pickRecordingMimeType(): string {
  const ctor = browser().MediaRecorder;
  if (!ctor || typeof ctor.isTypeSupported !== 'function') return '';
  for (const candidate of RECORDING_MIME_PREFERENCE) {
    if (ctor.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

function errorText(error: unknown): string {
  return (error as { message?: string } | null)?.message ?? 'unknown error';
}

function microphoneErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return MESSAGES.noMicrophone;
  // The device exists and permission was given, but something else holds it (a call, another tab).
  // `TrackStartError` is the legacy Chrome spelling of the same condition.
  if (name === 'NotReadableError' || name === 'TrackStartError') return MESSAGES.microphoneBusy;
  return MESSAGES.permissionDenied;
}

function speechErrorMessage(code: string): string {
  if (code === 'not-allowed') return MESSAGES.permissionDenied;
  if (code === 'audio-capture') return MESSAGES.noMicrophone;
  return code ? `Voice input failed (${code}). Please try again.` : MESSAGES.processingFailed;
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // A track already ended; the microphone is released either way.
    }
  }
}

interface RecorderSession {
  recorder: MediaRecorder;
  stream: MediaStream | null;
  chunks: Blob[];
  /** Bytes seen so far, counted as chunks arrive so the cap fires DURING the recording. */
  bytes: number;
  requestedMimeType: string;
  timer: ReturnType<typeof setTimeout> | null;
  /** Set when the clip passed {@link MAX_RECORDING_BYTES}; the audio is dropped, not sent. */
  oversize: boolean;
  /** Resolves after the recorder's final `dataavailable`, whoever stopped it. */
  stopped: Promise<void>;
}

export interface UseSpeechInputOptions {
  /** The component's `settings.enableSpeechToText`. While false, nothing starts. */
  enabled: boolean;
  /**
   * `useAI().transcribeAudio`. Never rejects — failures arrive as `{ success: false, errorMessage }`.
   */
  transcribe: (
    audio: Blob,
    contentType?: string,
    configurationId?: string,
    language?: string,
  ) => Promise<SpeechTranscriptionResult>;
  /** Finished speech, ready to append to the chat input. Already trimmed and never empty. */
  onTranscript: (text: string) => void;
  /** A message for the component's non-blocking error banner. */
  onError: (message: string) => void;
  /** The chat's active AI configuration, passed to the server exactly as Blazor passes it. */
  configurationId?: string;
  /** BCP-47 tag for recognition and for the server. Defaults to `en-US` for the native path. */
  language?: string;
}

export interface UseSpeechInputResult {
  /** `'none'` means no voice input exists here, so the caller renders no mic button. */
  mode: SpeechInputMode;
  isListening: boolean;
  /**
   * The microphone has been asked for but the browser has not answered yet — in practice, its
   * permission prompt is on screen. Callers should disable the mic button for this window: the hook
   * refuses a second `start()` anyway, but a live-looking button that does nothing is worse UI.
   */
  isStarting: boolean;
  isTranscribing: boolean;
  /** Live, not-yet-final speech (native mode only). Empty in recorder mode. */
  interimTranscript: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggle: () => Promise<void>;
}

export function useSpeechInput(options: UseSpeechInputOptions): UseSpeechInputResult {
  const [mode, setMode] = useState<SpeechInputMode>('none');
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');

  // Options change on every render; the start/stop callbacks must not. They read the latest
  // options through this ref instead of listing them as dependencies.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // State the callbacks need to READ synchronously, mirrored into refs because a callback only
  // ever sees the state it was created with.
  const modeRef = useRef<SpeechInputMode>('none');
  const listeningRef = useRef(false);
  const transcribingRef = useRef(false);
  /**
   * A recorder start is between "microphone requested" and "recorder running". `listeningRef` is
   * still false across that whole `getUserMedia` await, so this is the only thing standing between
   * a double tap and two concurrent recordings — see {@link startRecording}.
   */
  const startingRef = useRef(false);
  /** Set when a `stop()` lands during that window: the stream that arrives late is thrown away. */
  const cancelStartRef = useRef(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sessionRef = useRef<RecorderSession | null>(null);
  const finalizeRef = useRef<Promise<void> | null>(null);
  const unmountedRef = useRef(false);

  const applyMode = useCallback((next: SpeechInputMode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  const applyListening = useCallback((next: boolean) => {
    listeningRef.current = next;
    setIsListening(next);
  }, []);

  const applyStarting = useCallback((next: boolean) => {
    startingRef.current = next;
    // The ref is what guards re-entry; the state only drives the button, and a resolution that
    // lands after unmount has no button left to drive.
    if (!unmountedRef.current) setIsStarting(next);
  }, []);

  const applyTranscribing = useCallback((next: boolean) => {
    transcribingRef.current = next;
    setIsTranscribing(next);
  }, []);

  const report = useCallback((message: string) => {
    optionsRef.current.onError(message);
  }, []);

  // --- recorder (MediaRecorder -> server transcription) ---------------------------------------

  const releaseStream = useCallback((session: RecorderSession) => {
    const stream = session.stream;
    if (!stream) return;
    session.stream = null;
    stopTracks(stream);
  }, []);

  const stopRecorder = useCallback((session: RecorderSession) => {
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch {
      // Already inactive.
    }
  }, []);

  /** Resolves on the recorder's `stop`, or on {@link STOP_EVENT_TIMEOUT_MS} — never hangs. */
  const awaitStop = useCallback((session: RecorderSession) => {
    return new Promise<void>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, STOP_EVENT_TIMEOUT_MS);
      void session.stopped.then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      });
    });
  }, []);

  const finalizeCore = useCallback(
    async (session: RecorderSession) => {
      try {
        if (session.timer !== null) {
          clearTimeout(session.timer);
          session.timer = null;
        }
        stopRecorder(session);
        await awaitStop(session);
        releaseStream(session);
        applyListening(false);

        if (session.oversize) {
          report(MESSAGES.tooLarge);
          return;
        }

        const mimeType =
          session.recorder.mimeType || session.chunks[0]?.type || session.requestedMimeType || 'audio/webm';
        const audio = new Blob(session.chunks, { type: mimeType });
        session.chunks = [];

        // A stop with nothing recorded is a mis-tap, not a failure — Blazor stays silent too.
        if (audio.size === 0) return;
        if (audio.size > MAX_RECORDING_BYTES) {
          report(MESSAGES.tooLarge);
          return;
        }

        applyTranscribing(true);
        const { transcribe, configurationId, language, onTranscript } = optionsRef.current;
        const result = await transcribe(audio, mimeType, configurationId || undefined, language || undefined);
        if (result.success) {
          const text = result.text?.trim();
          if (text) onTranscript(text);
        } else {
          report(result.errorMessage || MESSAGES.transcriptionFailed);
        }
      } catch {
        report(MESSAGES.processingFailed);
      } finally {
        releaseStream(session);
        applyTranscribing(false);
        applyListening(false);
      }
    },
    [stopRecorder, awaitStop, releaseStream, applyListening, applyTranscribing, report],
  );

  /**
   * Stops the active recording, transcribes it, and hands the text back. Safe to call from
   * several places at once (mic tap, the 60s auto-stop, the size cap): concurrent callers share
   * the single in-flight finalize, exactly as Blazor's `_finalizeRecordingTask` does.
   */
  const finalizeRecording = useCallback(async () => {
    if (finalizeRef.current) {
      await finalizeRef.current;
      return;
    }
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;

    const run = finalizeCore(session);
    finalizeRef.current = run;
    try {
      await run;
    } finally {
      finalizeRef.current = null;
    }
  }, [finalizeCore]);

  /**
   * Opens the microphone and starts a clip.
   *
   * `getUserMedia` is an await, and nothing observable changes until it resolves — so without a
   * guard a double tap of the mic button (very likely while the browser's permission prompt is up)
   * would run this twice, and the second session would overwrite `sessionRef` and orphan the first:
   * an open microphone with no timer, no UI and no way to stop it. {@link startingRef} therefore
   * goes up SYNCHRONOUSLY, before the await, and comes down on every exit — started, refused,
   * unmounted, or stopped while the prompt was still open.
   */
  const startRecording = useCallback(async () => {
    if (startingRef.current) return;

    const globals = browser();
    const mediaDevices = globals.navigator?.mediaDevices;
    const MediaRecorderCtor = globals.MediaRecorder;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function' || !MediaRecorderCtor) {
      report(MESSAGES.unsupported);
      return;
    }

    cancelStartRef.current = false;
    applyStarting(true);

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      applyStarting(false);
      report(microphoneErrorMessage(err));
      return;
    }

    // Nothing to record into: the component went away, or the user stopped again, while permission
    // was being granted. Either way the microphone the browser just handed over goes straight back.
    if (unmountedRef.current || cancelStartRef.current) {
      cancelStartRef.current = false;
      applyStarting(false);
      stopTracks(stream);
      return;
    }

    const requestedMimeType = pickRecordingMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = requestedMimeType
        ? new MediaRecorderCtor(stream, { mimeType: requestedMimeType })
        : new MediaRecorderCtor(stream);
    } catch (err) {
      applyStarting(false);
      stopTracks(stream);
      report(`Voice recording could not start: ${errorText(err)}`);
      return;
    }

    let resolveStopped: () => void = () => undefined;
    const session: RecorderSession = {
      recorder,
      stream,
      chunks: [],
      bytes: 0,
      requestedMimeType,
      timer: null,
      oversize: false,
      stopped: new Promise<void>((resolve) => {
        resolveStopped = resolve;
      }),
    };

    recorder.ondataavailable = (event: BlobEvent) => {
      const data = event?.data;
      if (!data || data.size === 0 || session.oversize) return;
      session.bytes += data.size;
      if (session.bytes > MAX_RECORDING_BYTES) {
        // Refuse the clip rather than post something the server will reject: drop what was
        // captured, stop the microphone, and let finalize report it.
        session.oversize = true;
        session.chunks = [];
        stopRecorder(session);
        void finalizeRecording();
        return;
      }
      session.chunks.push(data);
    };
    recorder.addEventListener('stop', () => {
      releaseStream(session);
      resolveStopped();
    });

    try {
      recorder.start(RECORDER_TIMESLICE_MS);
    } catch (err) {
      applyStarting(false);
      stopTracks(stream);
      report(`Voice recording could not start: ${errorText(err)}`);
      return;
    }

    session.timer = setTimeout(() => {
      session.timer = null;
      if (sessionRef.current !== session) return;
      void finalizeRecording();
    }, MAX_RECORDING_SECONDS * 1000);

    sessionRef.current = session;
    setInterimTranscript('');
    applyListening(true);
    // Last, so there is never a tick in which neither flag is set and a tap could slip through.
    applyStarting(false);
  }, [report, stopRecorder, releaseStream, finalizeRecording, applyListening, applyStarting]);

  // --- native (Web Speech API) ----------------------------------------------------------------

  /** Drops a recognition's handlers so a trailing `onend`/`onerror` cannot touch a later session. */
  const detach = useCallback((recognition: SpeechRecognitionLike) => {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    if (recognitionRef.current === recognition) recognitionRef.current = null;
  }, []);

  const stopNative = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    detach(recognition);
    try {
      recognition.stop();
    } catch {
      // Already stopped, or stopped between the check and the call.
    }
    applyListening(false);
    setInterimTranscript('');
  }, [detach, applyListening]);

  const startNative = useCallback(() => {
    const Recognition = speechRecognitionCtor();
    if (!Recognition) {
      report(MESSAGES.unsupported);
      return;
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Recognition();
    } catch {
      report(MESSAGES.unsupported);
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = optionsRef.current.language || 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? '';
        if (result?.isFinal) final += transcript;
        else interim += transcript;
      }
      if (final.trim()) {
        optionsRef.current.onTranscript(final.trim());
        setInterimTranscript('');
      } else if (interim) {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      const code = event?.error ?? '';

      if (DOWNGRADE_ERROR_CODES.has(code)) {
        // The engine exposes recognition but cannot run it here. Detach first so the trailing
        // `onend` never lands on the recording that follows.
        detach(recognition);
        try {
          recognition.abort?.();
        } catch {
          // Nothing to abort.
        }
        applyListening(false);
        setInterimTranscript('');

        // An engine can expose recognition without a backend AND have no MediaRecorder to fall
        // back on. Downgrading to 'recorder' there would leave a live-looking mic button that only
        // ever says "unsupported"; 'none' is the truth, and the caller hides the button.
        if (!recorderSupported()) {
          applyMode('none');
          report(MESSAGES.unsupported);
          return;
        }

        applyMode('recorder');
        void startRecording();
        return;
      }

      detach(recognition);
      applyListening(false);
      setInterimTranscript('');
      if (!SILENT_ERROR_CODES.has(code)) report(speechErrorMessage(code));
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      applyListening(false);
      setInterimTranscript('');
    };

    try {
      recognition.start();
    } catch (err) {
      detach(recognition);
      report(`Voice input could not start: ${errorText(err)}`);
      return;
    }

    recognitionRef.current = recognition;
    applyListening(true);
    setInterimTranscript('');
  }, [report, detach, applyMode, applyListening, startRecording]);

  // --- public surface --------------------------------------------------------------------------

  const start = useCallback(async () => {
    if (!optionsRef.current.enabled) return;
    // `startingRef` covers the window `listeningRef` cannot: the microphone is requested but the
    // browser has not answered yet.
    if (listeningRef.current || transcribingRef.current || startingRef.current) return;
    if (modeRef.current === 'none') {
      report(MESSAGES.unsupported);
      return;
    }
    if (modeRef.current === 'recorder') {
      await startRecording();
      return;
    }
    startNative();
  }, [report, startRecording, startNative]);

  const stop = useCallback(async () => {
    if (modeRef.current === 'recorder') {
      // A stop that lands while the permission prompt is still open cancels the pending start:
      // the stream that eventually resolves is released without ever reaching a recorder.
      if (startingRef.current) cancelStartRef.current = true;
      await finalizeRecording();
      return;
    }
    stopNative();
  }, [finalizeRecording, stopNative]);

  const toggle = useCallback(async () => {
    if (listeningRef.current) await stop();
    else await start();
  }, [start, stop]);

  // Detection is client-only and runs once: a later downgrade must survive re-renders.
  useEffect(() => {
    applyMode(detectSpeechInputMode());
  }, [applyMode]);

  // Turning the feature off mid-session stops it. In recorder mode the clip is still transcribed:
  // the audio was already captured, and dropping it would lose what the user just said.
  useEffect(() => {
    if (!options.enabled && listeningRef.current) void stop();
  }, [options.enabled, stop]);

  // Unmount: drop the recognition, stop the recorder and release the microphone. The clip is
  // discarded — there is nothing left to append it to.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      // A getUserMedia still in flight resolves into a component that no longer exists; the flag
      // above is what makes it release the stream instead of recording into nothing.
      startingRef.current = false;
      cancelStartRef.current = false;
      const recognition = recognitionRef.current;
      if (recognition) {
        recognitionRef.current = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          if (recognition.abort) recognition.abort();
          else recognition.stop();
        } catch {
          // Already gone.
        }
      }
      const session = sessionRef.current;
      if (session) {
        sessionRef.current = null;
        if (session.timer !== null) clearTimeout(session.timer);
        try {
          if (session.recorder.state !== 'inactive') session.recorder.stop();
        } catch {
          // Already inactive.
        }
        const stream = session.stream;
        session.stream = null;
        if (stream) stopTracks(stream);
      }
    };
  }, []);

  return { mode, isListening, isStarting, isTranscribing, interimTranscript, start, stop, toggle };
}
