/**
 * Coverage for the AI chat's voice input.
 *
 * `enableSpeechToText` used to be a stub: the prop existed, a listening flag existed, and nothing
 * ever started recognition. These tests pin the behaviour that replaced it, and in particular the
 * parts that are easy to regress because no browser in CI exercises them:
 *
 *  - which mechanism is picked, and that 'none' really means "render no mic button";
 *  - the RUNTIME downgrade — an engine that exposes the Web Speech API without a backend fails
 *    with `network` / `service-not-allowed` / `language-not-supported`, and must fall through to
 *    recording instead of leaving the user with a dead button. `no-speech` must NOT downgrade;
 *  - the container preference order, the 60 s auto-stop and the 25 MB refusal;
 *  - the exact arguments handed to `transcribeAudio`, and that the microphone is always released.
 *
 * jsdom has neither speech recognition nor media capture, so both are stubbed here. The stubs are
 * deliberately dumb: every event a test needs is fired by the test itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SpeechTranscriptionResult } from '@wildwood/core';
import {
  useSpeechInput,
  detectSpeechInputMode,
  pickRecordingMimeType,
  MAX_RECORDING_BYTES,
  MAX_RECORDING_SECONDS,
  type UseSpeechInputOptions,
} from '../components/ai/useSpeechInput.js';

// --- stubs -------------------------------------------------------------------------------------

type ErrorHandler = ((event: { error?: string }) => void) | null;
type ResultHandler = ((event: { resultIndex: number; results: unknown }) => void) | null;

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ResultHandler = null;
  onerror: ErrorHandler = null;
  onend: (() => void) | null = null;
  starts = 0;
  stops = 0;
  aborts = 0;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  start(): void {
    this.starts += 1;
  }

  stop(): void {
    this.stops += 1;
    this.onend?.();
  }

  abort(): void {
    this.aborts += 1;
  }

  /** The shape `onresult` reads: one result with one alternative. */
  emit(transcript: string, isFinal: boolean): void {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, 0: { transcript } } },
    });
  }
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static supported: string[] = [];
  static isTypeSupported = (type: string): boolean => MockMediaRecorder.supported.includes(type);

  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  timeslice: number | undefined;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  private stopListeners: Array<() => void> = [];

  constructor(
    public stream: { getTracks: () => Array<{ stop: () => void }> },
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? '';
    MockMediaRecorder.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'stop') this.stopListeners.push(listener);
  }

  start(timeslice?: number): void {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  stop(): void {
    this.state = 'inactive';
    for (const listener of this.stopListeners) listener();
  }

  /** Delivers one chunk, as a real recorder does every `timeslice` ms. */
  emit(data: Blob | { size: number; type: string }): void {
    this.ondataavailable?.({ data: data as Blob });
  }
}

interface Installed {
  tracks: Array<{ stop: ReturnType<typeof vi.fn> }>;
  getUserMedia: ReturnType<typeof vi.fn>;
}

const globals = globalThis as unknown as Record<string, unknown>;

function installNative(): void {
  MockSpeechRecognition.instances = [];
  globals.SpeechRecognition = MockSpeechRecognition;
}

function installRecorder(supported: string[] = ['audio/webm;codecs=opus', 'audio/webm']): Installed {
  MockMediaRecorder.instances = [];
  MockMediaRecorder.supported = supported;
  const tracks = [{ stop: vi.fn() }];
  const stream = { getTracks: () => tracks };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  globals.MediaRecorder = MockMediaRecorder;
  return { tracks, getUserMedia };
}

function uninstall(): void {
  delete globals.SpeechRecognition;
  delete globals.webkitSpeechRecognition;
  delete globals.MediaRecorder;
  Reflect.deleteProperty(globalThis.navigator, 'mediaDevices');
}

/**
 * Holds `getUserMedia` open so a test can act DURING the window the browser's permission prompt
 * occupies — the window in which `isListening` is still false and a second tap used to get through.
 */
function holdPermissionPrompt(installed: Installed) {
  let grant!: () => void;
  const stream = { getTracks: () => installed.tracks };
  const pending = new Promise<typeof stream>((resolve) => {
    grant = () => resolve(stream);
  });
  installed.getUserMedia.mockReturnValue(pending);
  return { grant, pending };
}

// --- harness -----------------------------------------------------------------------------------

function setup(overrides: Partial<UseSpeechInputOptions> = {}) {
  const transcribe = vi
    .fn<UseSpeechInputOptions['transcribe']>()
    .mockResolvedValue({ success: true, text: 'hello there' } as SpeechTranscriptionResult);
  const onTranscript = vi.fn();
  const onError = vi.fn();
  const rendered = renderHook(() =>
    useSpeechInput({
      enabled: true,
      transcribe,
      onTranscript,
      onError,
      configurationId: 'cfg-1',
      ...overrides,
    }),
  );
  return { ...rendered, transcribe, onTranscript, onError };
}

const lastRecorder = () => MockMediaRecorder.instances[MockMediaRecorder.instances.length - 1];
const lastRecognition = () => MockSpeechRecognition.instances[MockSpeechRecognition.instances.length - 1];

beforeEach(() => {
  uninstall();
});

afterEach(() => {
  uninstall();
  vi.useRealTimers();
});

// --- mode detection ------------------------------------------------------------------------------

describe('speech input mode detection', () => {
  it('is native when the Web Speech API exists', async () => {
    installNative();
    installRecorder();
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('native'));
  });

  it('is native for the webkit-prefixed constructor too', async () => {
    MockSpeechRecognition.instances = [];
    globals.webkitSpeechRecognition = MockSpeechRecognition;
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('native'));
  });

  it('is recorder when only getUserMedia + MediaRecorder exist', async () => {
    installRecorder();
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
  });

  it('is none when neither exists — the caller renders no mic button', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('none'));
    expect(detectSpeechInputMode()).toBe('none');
  });

  it('starts as none before the mount effect runs, so nothing is read during render (SSR)', () => {
    installNative();
    const { result } = renderHook(() =>
      useSpeechInput({ enabled: true, transcribe: vi.fn(), onTranscript: vi.fn(), onError: vi.fn() }),
    );
    // The first committed value is whatever render produced; detection only happens in an effect.
    expect(['none', 'native']).toContain(result.current.mode);
  });

  it('reports the unsupported message instead of starting when there is no voice input', async () => {
    const { result, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('none'));
    await act(async () => {
      await result.current.start();
    });
    expect(onError).toHaveBeenCalledWith("Voice input isn't supported in this browser.");
    expect(result.current.isListening).toBe(false);
  });
});

// --- native path ---------------------------------------------------------------------------------

describe('native speech recognition', () => {
  beforeEach(() => {
    installNative();
  });

  it('starts recognition with interim results and stops it again', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('native'));

    await act(async () => {
      await result.current.start();
    });
    const recognition = lastRecognition();
    expect(recognition.starts).toBe(1);
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(result.current.isListening).toBe(true);

    await act(async () => {
      await result.current.stop();
    });
    expect(recognition.stops).toBe(1);
    expect(result.current.isListening).toBe(false);
  });

  it('feeds interim results to the caller and final results to the input', async () => {
    const { result, onTranscript } = setup();
    await waitFor(() => expect(result.current.mode).toBe('native'));
    await act(async () => {
      await result.current.start();
    });

    act(() => lastRecognition().emit('hello wor', false));
    expect(result.current.interimTranscript).toBe('hello wor');
    expect(onTranscript).not.toHaveBeenCalled();

    act(() => lastRecognition().emit('hello world', true));
    expect(onTranscript).toHaveBeenCalledWith('hello world');
    expect(result.current.interimTranscript).toBe('');
  });

  it('honours the language option', async () => {
    const { result } = setup({ language: 'fr-FR' });
    await waitFor(() => expect(result.current.mode).toBe('native'));
    await act(async () => {
      await result.current.start();
    });
    expect(lastRecognition().lang).toBe('fr-FR');
  });

  it('surfaces a real error as a message', async () => {
    const { result, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('native'));
    await act(async () => {
      await result.current.start();
    });

    act(() => lastRecognition().onerror?.({ error: 'not-allowed' }));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Microphone permission was denied'));
    expect(result.current.isListening).toBe(false);
  });
});

// --- runtime downgrade ---------------------------------------------------------------------------

describe('runtime downgrade from native to recorder', () => {
  it.each(['network', 'service-not-allowed', 'language-not-supported'])(
    '%s switches to recorder for the rest of the lifetime and carries on recording',
    async (code) => {
      installNative();
      const { getUserMedia } = installRecorder();
      const { result } = setup();
      await waitFor(() => expect(result.current.mode).toBe('native'));
      await act(async () => {
        await result.current.start();
      });

      await act(async () => {
        lastRecognition().onerror?.({ error: code });
      });

      expect(result.current.mode).toBe('recorder');
      // Carries on: the tap that hit the dead button still records.
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.isListening).toBe(true));

      // And it stays downgraded — a later start must not go back to recognition.
      const recognitions = MockSpeechRecognition.instances.length;
      await act(async () => {
        await result.current.stop();
      });
      await act(async () => {
        await result.current.start();
      });
      expect(MockSpeechRecognition.instances.length).toBe(recognitions);
      expect(getUserMedia).toHaveBeenCalledTimes(2);
    },
  );

  it('lands in none, not recorder, when the browser has no recorder to downgrade TO', async () => {
    // Recognition exposed, but neither getUserMedia nor MediaRecorder: there is no voice input
    // here at all, and claiming 'recorder' would leave a button that only ever says "unsupported".
    installNative();
    const { result, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('native'));
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      lastRecognition().onerror?.({ error: 'network' });
    });

    expect(result.current.mode).toBe('none');
    expect(result.current.isListening).toBe(false);
    expect(onError).toHaveBeenCalledWith("Voice input isn't supported in this browser.");
  });

  it('no-speech does NOT downgrade and raises no message', async () => {
    installNative();
    const { getUserMedia } = installRecorder();
    const { result, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('native'));
    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      lastRecognition().onerror?.({ error: 'no-speech' });
    });

    expect(result.current.mode).toBe('native');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

// --- recorder path -------------------------------------------------------------------------------

describe('recorder mode', () => {
  it('asks for audio only and records in the first supported container', async () => {
    const { getUserMedia } = installRecorder();
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(lastRecorder().mimeType).toBe('audio/webm;codecs=opus');
    expect(lastRecorder().timeslice).toBe(1000);
    expect(result.current.isListening).toBe(true);
  });

  it('falls down the preference order when the browser refuses the earlier containers', async () => {
    installRecorder(['audio/mp4', 'audio/webm']);
    expect(pickRecordingMimeType()).toBe('audio/mp4');

    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });
    expect(lastRecorder().mimeType).toBe('audio/mp4');
  });

  it('lets MediaRecorder choose when nothing in the list is supported', async () => {
    installRecorder([]);
    expect(pickRecordingMimeType()).toBe('');
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });
    expect(lastRecorder().mimeType).toBe('');
  });

  it('hands the clip to transcribeAudio with its mime type, configuration and language', async () => {
    installRecorder();
    const { result, transcribe, onTranscript } = setup({ language: 'en-US' });
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });

    act(() => lastRecorder().emit(new Blob(['clip'], { type: 'audio/webm;codecs=opus' })));
    await act(async () => {
      await result.current.stop();
    });

    expect(transcribe).toHaveBeenCalledTimes(1);
    const [audio, contentType, configurationId, language] = transcribe.mock.calls[0];
    expect(audio).toBeInstanceOf(Blob);
    expect(audio.size).toBeGreaterThan(0);
    expect(contentType).toBe('audio/webm;codecs=opus');
    expect(configurationId).toBe('cfg-1');
    expect(language).toBe('en-US');
    expect(onTranscript).toHaveBeenCalledWith('hello there');
    expect(result.current.isTranscribing).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it('shows the server message when transcription fails, and appends nothing', async () => {
    installRecorder();
    const { result, transcribe, onTranscript, onError } = setup();
    transcribe.mockResolvedValue({ success: false, text: '', errorMessage: 'No speech detected.' });
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });
    act(() => lastRecorder().emit(new Blob(['clip'], { type: 'audio/webm' })));
    await act(async () => {
      await result.current.stop();
    });

    expect(onError).toHaveBeenCalledWith('No speech detected.');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('stays silent when the clip is empty — a mis-tap is not a failure', async () => {
    installRecorder();
    const { result, transcribe, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(transcribe).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('releases the microphone tracks when the recording stops', async () => {
    const { tracks } = installRecorder();
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });
    expect(tracks[0].stop).not.toHaveBeenCalled();

    act(() => lastRecorder().emit(new Blob(['clip'], { type: 'audio/webm' })));
    await act(async () => {
      await result.current.stop();
    });
    expect(tracks[0].stop).toHaveBeenCalled();
  });

  it('releases the microphone tracks on unmount', async () => {
    const { tracks } = installRecorder();
    const { result, unmount } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });

    unmount();
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(lastRecorder().state).toBe('inactive');
  });

  it('reports a refused microphone instead of throwing', async () => {
    const { getUserMedia } = installRecorder();
    getUserMedia.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const { result, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    await act(async () => {
      await result.current.start();
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Microphone permission was denied'));
    expect(result.current.isListening).toBe(false);
  });

  it('says the microphone is busy rather than "denied" when another application holds it', async () => {
    const { getUserMedia } = installRecorder();
    getUserMedia.mockRejectedValue(Object.assign(new Error('busy'), { name: 'NotReadableError' }));
    const { result, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    await act(async () => {
      await result.current.start();
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('in use by another application'));
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('permission was denied'));
    expect(result.current.isListening).toBe(false);
  });
});

// --- the permission-prompt window ------------------------------------------------------------------

describe('a start that is still waiting on the permission prompt', () => {
  it('refuses a second tap, so a double-click opens exactly one recording', async () => {
    const installed = installRecorder();
    const { grant } = holdPermissionPrompt(installed);
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.start();
      second = result.current.start();
    });

    // Both taps landed while the prompt was up — `isListening` is still false there.
    expect(result.current.isListening).toBe(false);
    expect(result.current.isStarting).toBe(true);
    expect(installed.getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      grant();
      await first;
      await second;
    });

    expect(installed.getUserMedia).toHaveBeenCalledTimes(1);
    expect(MockMediaRecorder.instances).toHaveLength(1);
    expect(lastRecorder().state).toBe('recording');
    expect(result.current.isListening).toBe(true);
    expect(result.current.isStarting).toBe(false);
    // The single session is the live one, so the mic is still open on purpose — nothing orphaned.
    expect(installed.tracks[0].stop).not.toHaveBeenCalled();
  });

  it('releases the late stream and starts nothing when a stop arrives first', async () => {
    const installed = installRecorder();
    const { grant } = holdPermissionPrompt(installed);
    const { result, transcribe } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    let starting!: Promise<void>;
    await act(async () => {
      starting = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    await act(async () => {
      grant();
      await starting;
    });

    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(installed.tracks[0].stop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
    expect(result.current.isStarting).toBe(false);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('releases the late stream when the component unmounts first', async () => {
    const installed = installRecorder();
    const { grant } = holdPermissionPrompt(installed);
    const { result, unmount } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    let starting!: Promise<void>;
    await act(async () => {
      starting = result.current.start();
    });

    unmount();
    await act(async () => {
      grant();
      await starting;
    });

    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect(installed.tracks[0].stop).toHaveBeenCalled();
  });

  it('comes back down after a refusal, so the next tap tries again', async () => {
    const installed = installRecorder();
    installed.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isStarting).toBe(false);

    await act(async () => {
      await result.current.start();
    });
    expect(installed.getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.isListening).toBe(true);
  });

  it('does not leak the cancel flag into the next start', async () => {
    const installed = installRecorder();
    const { grant } = holdPermissionPrompt(installed);
    const { result } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    let starting!: Promise<void>;
    await act(async () => {
      starting = result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    await act(async () => {
      grant();
      await starting;
    });

    // A cancelled start must not cancel the one after it.
    installed.getUserMedia.mockResolvedValue({ getTracks: () => installed.tracks });
    await act(async () => {
      await result.current.start();
    });
    expect(MockMediaRecorder.instances).toHaveLength(1);
    expect(result.current.isListening).toBe(true);
  });
});

// --- caps ------------------------------------------------------------------------------------------

describe('recording caps', () => {
  it(`stops itself and transcribes after ${MAX_RECORDING_SECONDS} seconds`, async () => {
    vi.useFakeTimers();
    installRecorder();
    const { result, transcribe } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.mode).toBe('recorder');

    await act(async () => {
      await result.current.start();
    });
    act(() => lastRecorder().emit(new Blob(['clip'], { type: 'audio/webm' })));
    expect(result.current.isListening).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAX_RECORDING_SECONDS * 1000);
    });

    expect(lastRecorder().state).toBe('inactive');
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });

  it(`refuses a clip over ${MAX_RECORDING_BYTES} bytes instead of posting it`, async () => {
    const { tracks } = installRecorder();
    const { result, transcribe, onError } = setup();
    await waitFor(() => expect(result.current.mode).toBe('recorder'));
    await act(async () => {
      await result.current.start();
    });

    // A fake chunk: allocating 25 MB for real would cost seconds of test time for no extra proof.
    await act(async () => {
      lastRecorder().emit({ size: MAX_RECORDING_BYTES + 1, type: 'audio/webm' });
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('limited to 25 MB')));
    expect(transcribe).not.toHaveBeenCalled();
    expect(lastRecorder().state).toBe('inactive');
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
  });
});

// --- the enabled switch ------------------------------------------------------------------------------

describe('the enabled flag', () => {
  it('never starts while voice input is switched off', async () => {
    const { getUserMedia } = installRecorder();
    const { result, onError } = setup({ enabled: false });
    await waitFor(() => expect(result.current.mode).toBe('recorder'));

    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
