/**
 * The chat component's half of voice input: the mic button exists only where the browser can
 * capture speech, a recorded clip is transcribed with the chat's ACTIVE configuration id, and the
 * text lands in the input box rather than being sent straight off.
 *
 * `useAI` is mocked so the component never touches the network; the browser speech APIs are stubbed
 * because jsdom has none. The mechanism itself is covered in `useSpeechInput.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { AIChatComponent } from '../components/ai/AIChatComponent.js';

const transcribeAudio = vi.fn().mockResolvedValue({ success: true, text: 'recorded words' });

const ai = {
  sessions: [],
  loading: false,
  error: null,
  sendMessage: vi.fn(),
  sendMessageWithFile: vi.fn(),
  getSessions: vi.fn().mockResolvedValue([]),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  getConfigurations: vi.fn().mockResolvedValue([{ id: 'cfg-1', name: 'Chat' }]),
  getTTSVoices: vi.fn().mockResolvedValue([]),
  synthesizeSpeech: vi.fn(),
  transcribeAudio,
};

vi.mock('../hooks/useAI.js', () => ({ useAI: () => ai }));

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = (type: string): boolean => type === 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  private stopListeners: Array<() => void> = [];

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? '';
    MockMediaRecorder.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'stop') this.stopListeners.push(listener);
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    for (const listener of this.stopListeners) listener();
  }
  emit(data: Blob): void {
    this.ondataavailable?.({ data });
  }
}

const globals = globalThis as unknown as Record<string, unknown>;

/**
 * `hold: true` keeps `getUserMedia` pending until `grant()` is called, which is how a test occupies
 * the window the browser's microphone-permission prompt occupies.
 */
function installRecorder(options: { hold?: boolean } = {}) {
  MockMediaRecorder.instances = [];
  const stream = { getTracks: () => [{ stop: vi.fn() }] };
  let release = (): void => undefined;
  const getUserMedia = vi.fn().mockImplementation(() =>
    options.hold
      ? new Promise((resolve) => {
          release = () => resolve(stream);
        })
      : Promise.resolve(stream),
  );
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  globals.MediaRecorder = MockMediaRecorder;
  return { getUserMedia, grant: () => release() };
}

beforeEach(() => {
  // jsdom implements no scrolling; the chat auto-scrolls to the newest message on every render.
  Element.prototype.scrollIntoView = vi.fn();
  transcribeAudio.mockClear();
  delete globals.MediaRecorder;
  delete globals.SpeechRecognition;
  Reflect.deleteProperty(globalThis.navigator, 'mediaDevices');
});

afterEach(cleanup);

describe('AIChatComponent voice input', () => {
  it('renders no mic button when the browser offers no voice input', async () => {
    render(<AIChatComponent settings={{ enableSpeechToText: true }} />);
    await waitFor(() => expect(ai.getConfigurations).toHaveBeenCalled());
    expect(screen.queryByTitle('Voice input')).toBeNull();
  });

  it('renders no mic button when the host did not ask for speech-to-text', async () => {
    installRecorder();
    render(<AIChatComponent settings={{ enableSpeechToText: false }} />);
    await waitFor(() => expect(ai.getConfigurations).toHaveBeenCalled());
    expect(screen.queryByTitle('Voice input')).toBeNull();
  });

  it('records, transcribes with the active configuration, and appends the text to the input', async () => {
    installRecorder();
    render(<AIChatComponent settings={{ enableSpeechToText: true }} />);
    const mic = await screen.findByTitle('Voice input');

    await act(async () => {
      fireEvent.click(mic);
    });
    const recorder = MockMediaRecorder.instances[MockMediaRecorder.instances.length - 1];
    expect(recorder.state).toBe('recording');

    act(() => recorder.emit(new Blob(['clip'], { type: 'audio/webm;codecs=opus' })));

    await act(async () => {
      fireEvent.click(await screen.findByTitle('Stop voice input'));
    });

    await waitFor(() => expect(transcribeAudio).toHaveBeenCalledTimes(1));
    expect(transcribeAudio.mock.calls[0][1]).toBe('audio/webm;codecs=opus');
    expect(transcribeAudio.mock.calls[0][2]).toBe('cfg-1');

    const input = screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toBe('recorded words'));
    expect(ai.sendMessage).not.toHaveBeenCalled();
  });

  it('disables the mic button while the microphone-permission prompt is open', async () => {
    const { getUserMedia, grant } = installRecorder({ hold: true });
    render(<AIChatComponent settings={{ enableSpeechToText: true }} />);
    const mic = (await screen.findByTitle('Voice input')) as HTMLButtonElement;
    expect(mic.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(mic);
    });

    // Permission is still pending: nothing is recording yet, and the button cannot be clicked again.
    expect(MockMediaRecorder.instances).toHaveLength(0);
    expect((screen.getByTitle('Voice input') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      grant();
    });

    await waitFor(() => expect(MockMediaRecorder.instances).toHaveLength(1));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect((await screen.findByTitle('Stop voice input')).hasAttribute('disabled')).toBe(false);
  });
});
