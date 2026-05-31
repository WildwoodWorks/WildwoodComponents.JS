import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import type { FeedbackDuplicateCheck } from '@wildwood/core';
import { useFeedback } from '../../hooks/useFeedback';
import { useAuth } from '../../hooks/useAuth';
import { collectNativeContext } from './feedbackNativeContext';

export interface FeedbackComponentProps {
  /** App to submit feedback for. Falls back to the WildwoodProvider config appId. */
  appId?: string;
  /** Position of the floating launcher button. Defaults to the config value or 'bottom-right'. */
  position?: 'bottom-right' | 'bottom-left';
  /** Accent color override (hex). Defaults to the config value or the SDK primary. */
  color?: string;
  /** Render the floating launcher button (default true). Set false to control open state yourself. */
  showLauncher?: boolean;
  /** Controlled open state (optional). */
  open?: boolean;
  /** Notified when the panel opens/closes. */
  onOpenChange?: (open: boolean) => void;
  /** Notified after a successful submission with the new feedback id. */
  onSubmitted?: (feedbackId: string) => void;
  /** Optional style applied to the floating launcher button container. */
  style?: ViewStyle;
  /**
   * Optional screenshot capture hook. React Native has no DOM/html2canvas, so the screenshot
   * UI is only shown when the consumer wires this — typically with `react-native-view-shot`:
   *
   *   import { captureScreen } from 'react-native-view-shot';
   *   <FeedbackComponent captureScreenshot={() => captureScreen({ format: 'jpg', quality: 0.8, result: 'data-uri' })} />
   *
   * Should resolve to a base64 data URL (or null if the capture is cancelled/unavailable).
   * Keeping it an injected callback avoids a hard native dependency (mirrors the StorageAdapter
   * pattern), while still giving feature parity with the web widget's screenshot capture.
   */
  captureScreenshot?: () => Promise<string | null>;
}

type StatusKind = 'success' | 'error';
interface StatusMessage {
  kind: StatusKind;
  text: string;
}

const DEFAULT_COLOR = '#2d5016';
const DEFAULT_TYPES = ['Bug', 'FeatureRequest', 'Improvement', 'Other'];

function humanizeType(t: string): string {
  return t.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * React Native feedback widget: a floating launcher button that opens a slide-up
 * modal feedback form. Mirrors the web FeedbackComponent
 * (packages/wildwood-react/src/components/feedback/FeedbackComponent.tsx) for
 * behavior parity — type picker from the widget config, debounced duplicate
 * detection, anonymous email/name when unauthenticated, "upvote instead" on a
 * duplicate, and 429/error handling — but renders with React Native primitives.
 *
 * Native differences from the web component (expected, per platform):
 *  - Screenshot capture is opt-in via the `captureScreenshot` prop (e.g. react-native-view-shot)
 *    instead of DOM/html2canvas; the screenshot UI only appears when that prop is wired. When the
 *    app config sets RequireScreenshot, submission is blocked until one is captured (parity with web).
 *  - No file attachments picker (requires a platform-specific document picker, not a
 *    `react-native` primitive). Kept out to stay dependency-free.
 *  - browserContext is a minimal native snapshot (Platform + Dimensions), never `window`.
 *  - AllowAnonymous: when the viewer is unauthenticated and the app forbids anonymous feedback,
 *    the widget renders nothing (parity with the web/Razor widgets).
 */
export function FeedbackComponent({
  appId,
  position,
  color,
  showLauncher = true,
  open,
  onOpenChange,
  onSubmitted,
  style,
  captureScreenshot,
}: FeedbackComponentProps) {
  const { config, submitting, loadConfig, submitFeedback, checkDuplicate, voteFeedback } = useFeedback();
  const { isAuthenticated } = useAuth();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const panelOpen = isControlled ? open : internalOpen;

  const [feedbackType, setFeedbackType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [duplicate, setDuplicate] = useState<FeedbackDuplicateCheck | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the widget config once.
  useEffect(() => {
    loadConfig().catch(() => {
      /* error surfaced via hook; widget still renders with safe defaults */
    });
  }, [loadConfig]);

  // Default the selected type to the first configured type.
  useEffect(() => {
    if (config?.feedbackTypes?.length && !feedbackType) {
      setFeedbackType(config.feedbackTypes[0]);
    }
  }, [config, feedbackType]);

  useEffect(() => {
    return () => {
      if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    };
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const resolvedPosition = position ?? (config?.widgetPosition === 'bottom-left' ? 'bottom-left' : 'bottom-right');
  const resolvedColor = color ?? config?.widgetColor ?? DEFAULT_COLOR;
  const enableDuplicate = config?.enableDuplicateDetection !== false;
  const requireScreenshot = config?.requireScreenshot === true;
  // Anonymous users cannot submit when the app forbids anonymous feedback.
  const anonymousBlocked = !isAuthenticated && config?.allowAnonymous === false;

  // Warn the developer if the app requires a screenshot but no capture is wired — the requirement
  // can't be met on native without it, so submission proceeds without one rather than dead-ending.
  useEffect(() => {
    if (requireScreenshot && !captureScreenshot) {
      console.warn(
        '[Wildwood] FeedbackComponent: this app config sets RequireScreenshot, but no `captureScreenshot` ' +
          'prop was provided. Submissions will proceed without a screenshot. Wire react-native-view-shot ' +
          '(captureScreenshot) to enable capture.',
      );
    }
  }, [requireScreenshot, captureScreenshot]);

  const feedbackTypes = useMemo(() => (config?.feedbackTypes?.length ? config.feedbackTypes : DEFAULT_TYPES), [config]);

  // Debounced duplicate detection on the title (mirrors the web component).
  const onTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (!enableDuplicate) return;
      if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
      if (value.trim().length < 5) {
        setDuplicate(null);
        return;
      }
      dupTimerRef.current = setTimeout(() => {
        checkDuplicate(value.trim())
          .then((result) => setDuplicate(result.hasPotentialDuplicate ? result : null))
          .catch(() => setDuplicate(null));
      }, 600);
    },
    [enableDuplicate, checkDuplicate],
  );

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setEmail('');
    setName('');
    setDuplicate(null);
    setScreenshotData(null);
    setFeedbackType(feedbackTypes[0] ?? '');
  }, [feedbackTypes]);

  const handleCaptureScreenshot = useCallback(async () => {
    if (!captureScreenshot) return;
    setStatus(null);
    setCapturing(true);
    try {
      const data = await captureScreenshot();
      if (data) setScreenshotData(data);
      else setStatus({ kind: 'error', text: 'Could not capture a screenshot.' });
    } catch {
      setStatus({ kind: 'error', text: 'Failed to capture screenshot.' });
    } finally {
      setCapturing(false);
    }
  }, [captureScreenshot]);

  const handleVote = useCallback(
    async (id: string) => {
      try {
        const result = await voteFeedback(id);
        setStatus({ kind: 'success', text: `Vote recorded! (${result.voteCount} total)` });
        setDuplicate(null);
        setTimeout(() => setOpen(false), 1200);
      } catch {
        setStatus({ kind: 'error', text: 'Could not record your vote.' });
      }
    },
    [voteFeedback, setOpen],
  );

  const handleSubmit = useCallback(async () => {
    setStatus(null);
    if (!title.trim()) {
      setStatus({ kind: 'error', text: 'Please enter a title.' });
      return;
    }
    if (!description.trim()) {
      setStatus({ kind: 'error', text: 'Please enter a description.' });
      return;
    }
    // Only enforce the screenshot requirement when capture is actually wired; otherwise there is
    // no way to satisfy it on native and we'd trap the user (a dev warning is logged on mount).
    if (requireScreenshot && captureScreenshot && !screenshotData) {
      setStatus({ kind: 'error', text: 'Please attach a screenshot before submitting.' });
      return;
    }

    try {
      const created = await submitFeedback({
        // appId prop wins; the hook/service fall back to the provider config appId.
        appId,
        title: title.trim(),
        description: description.trim(),
        feedbackType: feedbackType || feedbackTypes[0],
        // No URL on native; keep null so the server records it as absent.
        pageUrl: null,
        // Screenshot is opt-in via the captureScreenshot prop; null when not captured.
        screenshotData,
        // No file attachments on native.
        attachments: null,
        browserContext: collectNativeContext(),
        submitterEmail: !isAuthenticated && email.trim() ? email.trim() : null,
        submitterName: !isAuthenticated && name.trim() ? name.trim() : null,
      });
      setStatus({ kind: 'success', text: 'Thank you! Your feedback has been submitted.' });
      onSubmitted?.(created.id);
      resetForm();
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      const httpStatus = (err as { status?: number })?.status;
      if (httpStatus === 429) {
        setStatus({ kind: 'error', text: 'Too many submissions. Please try again later.' });
      } else {
        const message = err instanceof Error ? err.message : 'Failed to submit feedback.';
        setStatus({ kind: 'error', text: message });
      }
    }
  }, [
    title,
    description,
    feedbackType,
    feedbackTypes,
    appId,
    isAuthenticated,
    email,
    name,
    requireScreenshot,
    screenshotData,
    captureScreenshot,
    submitFeedback,
    onSubmitted,
    resetForm,
    setOpen,
  ]);

  // Don't render anything if the app has explicitly disabled the widget, or if the viewer is
  // anonymous and the app forbids anonymous feedback (parity with the web/Razor widgets).
  if (config && !config.isEnabled) return null;
  if (anonymousBlocked) return null;

  const positionStyle = resolvedPosition === 'bottom-left' ? styles.launcherLeft : styles.launcherRight;

  return (
    <>
      {showLauncher && !panelOpen && (
        <TouchableOpacity
          style={[styles.launcher, positionStyle, { backgroundColor: resolvedColor }, style]}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open feedback form"
          activeOpacity={0.85}
        >
          <Text style={styles.launcherIcon}>{'\u{1F4AC}'}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={panelOpen} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <View style={[styles.header, { backgroundColor: resolvedColor }]}>
              <Text style={styles.headerTitle}>Send Feedback</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close feedback form"
              >
                <Text style={styles.headerClose}>{'×'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {status && (
                <View style={[styles.status, status.kind === 'error' ? styles.statusError : styles.statusSuccess]}>
                  <Text style={status.kind === 'error' ? styles.statusErrorText : styles.statusSuccessText}>
                    {status.text}
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Type</Text>
              <View style={styles.typeRow}>
                {feedbackTypes.map((t) => {
                  const selected = (feedbackType || feedbackTypes[0]) === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeChip,
                        selected && { backgroundColor: resolvedColor, borderColor: resolvedColor },
                      ]}
                      onPress={() => setFeedbackType(t)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.typeChipText, selected && styles.typeChipTextSelected]}>
                        {humanizeType(t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>
                Title <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Brief summary"
                placeholderTextColor="#999"
                maxLength={200}
                value={title}
                onChangeText={onTitleChange}
              />

              {duplicate && (
                <View style={styles.duplicate}>
                  <Text style={styles.duplicateText}>
                    {'⚠'} Similar feedback exists: <Text style={styles.duplicateTitle}>{duplicate.duplicateTitle}</Text>
                    {duplicate.duplicateVoteCount > 0 ? ` (${duplicate.duplicateVoteCount} votes)` : ''}
                  </Text>
                  {duplicate.duplicateId && (
                    <TouchableOpacity
                      style={styles.voteButton}
                      onPress={() => handleVote(duplicate.duplicateId as string)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.voteButtonText}>{'\u{1F44D}'} Me too! Upvote instead</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <Text style={styles.label}>
                Description <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Tell us more..."
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {!isAuthenticated && (
                <>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.label}>Name (optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Your name"
                    placeholderTextColor="#999"
                    value={name}
                    onChangeText={setName}
                  />
                </>
              )}

              {captureScreenshot && (
                <>
                  <Text style={styles.label}>
                    Screenshot {requireScreenshot && <Text style={styles.required}>*</Text>}
                  </Text>
                  {screenshotData ? (
                    <View style={styles.screenshotPreviewWrap}>
                      <Image source={{ uri: screenshotData }} style={styles.screenshotPreview} resizeMode="contain" />
                      <TouchableOpacity
                        style={styles.screenshotRemove}
                        onPress={() => setScreenshotData(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Remove screenshot"
                      >
                        <Text style={styles.screenshotRemoveText}>{'×'}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.secondaryButton, capturing && styles.submitDisabled]}
                      onPress={handleCaptureScreenshot}
                      disabled={capturing}
                      accessibilityRole="button"
                    >
                      {capturing ? (
                        <ActivityIndicator color={resolvedColor} size="small" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>{'\u{1F4F7}'} Capture screenshot</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </>
              )}

              <TouchableOpacity
                style={[
                  styles.submit,
                  { backgroundColor: resolvedColor },
                  (submitting || capturing) && styles.submitDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting || capturing}
                accessibilityRole="button"
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  launcher: {
    position: 'absolute',
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  launcherRight: {
    right: 24,
  },
  launcherLeft: {
    left: 24,
  },
  launcherIcon: {
    fontSize: 24,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerClose: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 26,
  },
  body: {
    paddingHorizontal: 16,
  },
  bodyContent: {
    paddingVertical: 16,
    paddingBottom: 32,
  },
  status: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  statusError: {
    backgroundColor: '#FEE2E2',
  },
  statusSuccess: {
    backgroundColor: '#DCFCE7',
  },
  statusErrorText: {
    color: '#991B1B',
    fontSize: 13,
  },
  statusSuccessText: {
    color: '#166534',
    fontSize: 13,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  required: {
    color: '#c62828',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  typeChipText: {
    fontSize: 13,
    color: '#374151',
  },
  typeChipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fff',
  },
  textarea: {
    minHeight: 90,
  },
  duplicate: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    borderRadius: 4,
    padding: 12,
    marginTop: 10,
  },
  duplicateText: {
    fontSize: 13,
    color: '#92400E',
  },
  duplicateTitle: {
    fontWeight: '600',
  },
  voteButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  voteButtonText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    minHeight: 40,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  screenshotPreviewWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  screenshotPreview: {
    width: 160,
    height: 110,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#f1f1f1',
  },
  screenshotRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dc3545',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenshotRemoveText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 16,
  },
  submit: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    minHeight: 48,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
