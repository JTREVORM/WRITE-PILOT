/**
 * Emits JSON-LD.
 *
 * `dangerouslySetInnerHTML` is unavoidable for a `<script type="application/ld+json">`
 * tag, so the input is never user data — every caller passes an object built
 * from this application's own constants — and it is serialised with the
 * closing-tag sequence escaped, which is the one string that could break out
 * of the element.
 */
export function StructuredData({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
