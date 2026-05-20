// HTML sanitizer mirroring WildwoodComponents.Shared/Utilities/HtmlSanitizer.cs.
// Strips dangerous tags, event-handler attributes, and dangerous URL schemes.
// Uses DOMParser when available (browser); falls back to regex (Node, React Native).

const DANGEROUS_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta'];
const DANGEROUS_ATTRIBUTES = ['srcdoc', 'formaction'];
const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:'];
const URL_ATTRIBUTES = ['href', 'src', 'action'];

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  return typeof DOMParser !== 'undefined' ? sanitizeWithDom(html) : sanitizeWithRegex(html);
}

function sanitizeWithDom(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dangerous = doc.querySelectorAll(DANGEROUS_TAGS.join(','));
  dangerous.forEach((el) => el.remove());
  const allElements = doc.querySelectorAll('*');
  allElements.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on') || DANGEROUS_ATTRIBUTES.includes(attr.name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRIBUTES.includes(attr.name)) {
        const val = attr.value.trim().toLowerCase();
        if (DANGEROUS_SCHEMES.some((scheme) => val.startsWith(scheme))) {
          el.removeAttribute(attr.name);
        }
      }
    }
  });
  return doc.body.innerHTML;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeWithRegex(html: string): string {
  let result = html;

  for (const tag of DANGEROUS_TAGS) {
    result = result.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), '');
    result = result.replace(new RegExp(`<${tag}\\b[^>]*/?\\s*>`, 'gi'), '');
  }

  // Strip event handler attributes (on*) — loop until stable since each pass
  // only removes one per tag due to capture group anchoring.
  const eventHandlerPatterns = [
    /(<[^>]*?)\s+on\w+\s*=\s*"[^"]*"/gi,
    /(<[^>]*?)\s+on\w+\s*=\s*'[^']*'/gi,
    /(<[^>]*?)\s+on\w+\s*=\s*[^\s"'>]+/gi,
  ];
  let previous: string;
  do {
    previous = result;
    for (const pattern of eventHandlerPatterns) {
      result = result.replace(pattern, '$1');
    }
  } while (result !== previous);

  for (const attr of DANGEROUS_ATTRIBUTES) {
    result = result.replace(new RegExp(`\\s${attr}\\s*=\\s*"[^"]*"`, 'gi'), '');
    result = result.replace(new RegExp(`\\s${attr}\\s*=\\s*'[^']*'`, 'gi'), '');
    result = result.replace(new RegExp(`\\s${attr}\\s*=\\s*[^\\s"'>]+`, 'gi'), '');
  }

  for (const attr of URL_ATTRIBUTES) {
    for (const scheme of DANGEROUS_SCHEMES) {
      const escScheme = escapeRegex(scheme);
      result = result.replace(new RegExp(`\\s${attr}\\s*=\\s*"\\s*${escScheme}[^"]*"`, 'gi'), '');
      result = result.replace(new RegExp(`\\s${attr}\\s*=\\s*'\\s*${escScheme}[^']*'`, 'gi'), '');
      result = result.replace(new RegExp(`\\s${attr}\\s*=\\s*${escScheme}\\S*`, 'gi'), '');
    }
  }

  return result;
}
