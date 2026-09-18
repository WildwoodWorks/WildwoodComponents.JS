// schema.org offers for what the app sells, straight off the live catalog.
//
// No `'use client'`: this renders identically on a server and in a browser, and a prerendered
// pricing page wants the offers in its HTML. The prices come from `catalogToJsonLdOffers`, which
// leaves out anything the server has not priced rather than publishing a zero.

import { catalogToJsonLdOffers, type PublicCatalog } from '@wildwood/core';

export interface CatalogJsonLdProps {
  catalog: PublicCatalog;
  /** Canonical URL applied to every offer. */
  url?: string;
}

/**
 * `</script>` inside a JSON string would close the tag early. `<` has a JSON escape, so escaping it
 * keeps the payload byte-identical to a parser and inert to an HTML tokenizer.
 */
function toInertJson(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

export function CatalogJsonLd({ catalog, url }: CatalogJsonLdProps) {
  const offers = catalogToJsonLdOffers(catalog, url ? { url } : {});
  if (offers.length === 0) return null;

  const json = toInertJson({ '@context': 'https://schema.org', '@graph': offers });

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
