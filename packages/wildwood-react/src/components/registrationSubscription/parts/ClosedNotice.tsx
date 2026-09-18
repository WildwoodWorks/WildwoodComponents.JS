'use client';

// What a visitor sees when an app is not taking registrations.
//
// Kept as its own part because two very different screens need exactly the same words: the signup
// view when the app's authentication settings say registration is closed, and any host that wants
// to say so on a landing page without mounting the signup flow.

export interface ClosedNoticeProps {
  /** The sentence to show. */
  message: string;
  /** Where a visitor who still wants in should go. Omitted, no link is rendered. */
  contactUrl?: string;
  /** The link's text. */
  contactLabel?: string;
  /** Appended to the notice's own class. */
  className?: string;
}

export function ClosedNotice({ message, contactUrl, contactLabel, className }: ClosedNoticeProps) {
  const classes = ['ww-regsub-closed', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="status">
      <p className="ww-regsub-closed-message">{message}</p>
      {contactUrl && contactLabel ? (
        <a
          className="ww-btn ww-btn-outline"
          href={contactUrl}
          {...(contactUrl.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {contactLabel}
        </a>
      ) : null}
    </div>
  );
}
