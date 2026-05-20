import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sanitizeHtml } from '../utils/htmlSanitizer.js';

// Ports WildwoodComponents.Tests/Shared/HtmlSanitizerTests.cs (33 cases).
// Uses containment checks because DOMParser re-serializes output and may differ
// trivially from the input string while remaining semantically equivalent.

describe('sanitizeHtml', () => {
  describe('null/empty input', () => {
    it('null returns empty string', () => {
      expect(sanitizeHtml(null)).toBe('');
    });
    it('undefined returns empty string', () => {
      expect(sanitizeHtml(undefined)).toBe('');
    });
    it('empty string returns empty string', () => {
      expect(sanitizeHtml('')).toBe('');
    });
  });

  describe('safe content preserved', () => {
    it('safe html keeps text + tags', () => {
      const result = sanitizeHtml('<p>Hello <strong>world</strong></p>');
      expect(result).toContain('Hello');
      expect(result).toContain('<strong>world</strong>');
    });

    it('safe attributes are preserved', () => {
      const result = sanitizeHtml('<a href="https://example.com" class="link">Click</a>');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('class="link"');
      expect(result).toContain('Click');
    });

    it('plain text passes through', () => {
      const result = sanitizeHtml('This is just plain text with no HTML.');
      expect(result).toContain('This is just plain text with no HTML.');
    });
  });

  describe('dangerous tags', () => {
    it('removes script tag and content', () => {
      const result = sanitizeHtml(`<p>Hello</p><script>alert('xss')</script><p>World</p>`);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('removes style tag and content', () => {
      const result = sanitizeHtml('<p>Hello</p><style>body { display: none; }</style><p>World</p>');
      expect(result).not.toContain('<style>');
      expect(result).not.toContain('display: none');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('removes iframe tag and content', () => {
      const result = sanitizeHtml('<p>Text</p><iframe src="evil.com">content</iframe><p>More</p>');
      expect(result).not.toContain('<iframe');
      expect(result).toContain('Text');
      expect(result).toContain('More');
    });

    it('removes object tag', () => {
      const result = sanitizeHtml('<p>Before</p><object data="evil.swf">fallback</object><p>After</p>');
      expect(result).not.toContain('<object');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('removes self-closing embed', () => {
      const result = sanitizeHtml('<p>Before</p><embed src="evil.swf"><p>After</p>');
      expect(result).not.toContain('<embed');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('removes form tag and content', () => {
      const result = sanitizeHtml('<p>Before</p><form action="/steal"><input type="text"></form><p>After</p>');
      expect(result).not.toContain('<form');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('removes self-closing link tag', () => {
      const result = sanitizeHtml('<p>Before</p><link rel="stylesheet" href="evil.css"><p>After</p>');
      expect(result).not.toContain('<link');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('removes self-closing meta tag', () => {
      const result = sanitizeHtml('<p>Before</p><meta http-equiv="refresh" content="0;url=evil.com"><p>After</p>');
      expect(result).not.toContain('<meta');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    it('dangerous tags are case-insensitive', () => {
      const result = sanitizeHtml(`<p>Hello</p><SCRIPT>alert('xss')</SCRIPT><p>World</p>`);
      expect(result.toLowerCase()).not.toContain('<script');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('removes multiple dangerous tags', () => {
      const result = sanitizeHtml('<script>bad1</script><p>Good</p><style>.evil{}</style><iframe>bad2</iframe>');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('<style');
      expect(result).not.toContain('<iframe');
      expect(result).toContain('Good');
    });
  });

  describe('event handler attributes', () => {
    it('removes onclick', () => {
      const result = sanitizeHtml(`<button onclick="alert('xss')">Click</button>`);
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click');
    });

    it('removes onmouseover', () => {
      const result = sanitizeHtml('<div onmouseover="steal()">Hover</div>');
      expect(result).not.toContain('onmouseover');
      expect(result).toContain('Hover');
    });

    it('removes multiple event handlers on one element', () => {
      const result = sanitizeHtml('<div onclick="a()" onmouseover="b()" onload="c()">Text</div>');
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
      expect(result).not.toContain('onload');
      expect(result).toContain('Text');
    });

    it('removes single-quoted event handler', () => {
      const result = sanitizeHtml(`<div onclick='alert(1)'>Text</div>`);
      expect(result).not.toContain('onclick');
    });

    it('removes unquoted event handler', () => {
      const result = sanitizeHtml('<div onclick=alert(1)>Text</div>');
      expect(result).not.toContain('onclick');
      expect(result).toContain('Text');
    });

    it('preserves safe attributes alongside event handlers', () => {
      const result = sanitizeHtml(`<div class="safe" onclick="evil()" id="myDiv">Text</div>`);
      expect(result).not.toContain('onclick');
      expect(result).toContain('class="safe"');
      expect(result).toContain('id="myDiv"');
    });
  });

  describe('dangerous attributes', () => {
    it('removes srcdoc', () => {
      const result = sanitizeHtml(`<iframe srcdoc="<script>evil()</script>">content</iframe>`);
      expect(result).not.toContain('srcdoc');
    });

    it('removes formaction', () => {
      const result = sanitizeHtml(`<button formaction="https://evil.com/steal">Submit</button>`);
      expect(result).not.toContain('formaction');
      expect(result).toContain('Submit');
    });

    it('removes dangerous attribute even with mixed quotes', () => {
      const result = sanitizeHtml(`<button formaction="https://evil.com/it's-here">Submit</button>`);
      expect(result).not.toContain('formaction');
      expect(result).toContain('Submit');
    });
  });

  describe('dangerous URL schemes', () => {
    it('removes javascript: href entirely', () => {
      const result = sanitizeHtml(`<a href="javascript:alert(1)">Click</a>`);
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('href');
      expect(result).toContain('Click');
    });

    it('removes data: href entirely', () => {
      const result = sanitizeHtml(`<a href="data:text/html,<script>alert(1)</script>">Click</a>`);
      expect(result).not.toContain('data:');
      expect(result).not.toContain('href');
    });

    it('removes vbscript: href entirely', () => {
      const result = sanitizeHtml(`<a href="vbscript:MsgBox('xss')">Click</a>`);
      expect(result).not.toContain('vbscript:');
      expect(result).not.toContain('href');
    });

    it('removes javascript: src on img', () => {
      const result = sanitizeHtml(`<img src="javascript:alert(1)">`);
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('src');
    });

    it('preserves safe href', () => {
      const result = sanitizeHtml(`<a href="https://example.com">Link</a>`);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('Link');
    });

    it('dangerous scheme detection is case-insensitive', () => {
      const result = sanitizeHtml(`<a href="JAVASCRIPT:alert(1)">Click</a>`);
      expect(result.toLowerCase()).not.toContain('javascript:');
      expect(result).not.toContain('href');
    });
  });

  describe('combined / complex cases', () => {
    it('removes nested dangerous content', () => {
      const result = sanitizeHtml(
        `<div onclick="evil()"><script>alert(1)</script><a href="javascript:void(0)">Link</a></div>`,
      );
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('Link');
    });

    it('preserves a real-world disclaimer untouched', () => {
      const html =
        '<h2>Terms of Service</h2><p>By using this service, you agree to the following:</p>' +
        '<ul><li>You will not misuse the service</li>' +
        '<li>You accept our <a href="https://example.com/privacy">privacy policy</a></li></ul>' +
        '<p><strong>Last updated:</strong> January 2026</p>';
      const result = sanitizeHtml(html);
      expect(result).toContain('Terms of Service');
      expect(result).toContain('You will not misuse the service');
      expect(result).toContain('href="https://example.com/privacy"');
      expect(result).toContain('<strong>Last updated:</strong>');
      expect(result).toContain('January 2026');
    });

    it('removes event handlers from multiple elements', () => {
      const result = sanitizeHtml(`<p onclick="a()" onmouseover="b()">Text1</p><p onclick="c()">Text2</p>`);
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
      expect(result).toContain('Text1');
      expect(result).toContain('Text2');
    });
  });

  // Force the regex code path (RN / Node have no DOMParser).
  // jsdom always provides DOMParser, so we stub it out here to exercise the fallback.
  describe('regex fallback (no DOMParser)', () => {
    beforeAll(() => {
      vi.stubGlobal('DOMParser', undefined);
    });
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('returns empty string for null/undefined/empty', () => {
      expect(sanitizeHtml(null)).toBe('');
      expect(sanitizeHtml(undefined)).toBe('');
      expect(sanitizeHtml('')).toBe('');
    });

    it('removes script tag and content', () => {
      const result = sanitizeHtml(`<p>Hello</p><script>alert('xss')</script><p>World</p>`);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });

    it('removes onclick attribute', () => {
      const result = sanitizeHtml(`<button onclick="alert('xss')">Click</button>`);
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click');
    });

    it('removes single-quoted event handler', () => {
      const result = sanitizeHtml(`<div onclick='alert(1)'>Text</div>`);
      expect(result).not.toContain('onclick');
    });

    it('removes unquoted event handler', () => {
      const result = sanitizeHtml('<div onclick=alert(1)>Text</div>');
      expect(result).not.toContain('onclick');
    });

    it('removes javascript: href entirely', () => {
      const result = sanitizeHtml(`<a href="javascript:alert(1)">Click</a>`);
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('href');
      expect(result).toContain('Click');
    });

    it('preserves safe href', () => {
      const result = sanitizeHtml(`<a href="https://example.com">Link</a>`);
      expect(result).toContain('https://example.com');
      expect(result).toContain('Link');
    });

    it('removes srcdoc attribute', () => {
      const result = sanitizeHtml(`<iframe srcdoc="<script>evil()</script>">x</iframe>`);
      expect(result).not.toContain('srcdoc');
    });

    it('removes formaction attribute', () => {
      const result = sanitizeHtml(`<button formaction="https://evil.com/steal">Submit</button>`);
      expect(result).not.toContain('formaction');
      expect(result).toContain('Submit');
    });

    it('dangerous tag detection is case-insensitive', () => {
      const result = sanitizeHtml(`<P>Hello</P><SCRIPT>alert(1)</SCRIPT><P>World</P>`);
      expect(result.toLowerCase()).not.toContain('<script');
    });
  });
});
