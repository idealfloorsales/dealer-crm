# Non-destructive media and query improvements

This rollout does not migrate or recompress stored images, delete records, merge dealer branches, or enable offline storage. Originals remain in their existing storage.

## Media delivery

- Embedded JPEG/PNG/WebP/AVIF/GIF images can be rendered as JPEG previews. Both dimensions are bounded, EXIF orientation is respected, enlargement is disabled. Failed transformations preserve the original rather than breaking the page.
- The image transformer runs one decode at a time, has a bounded queue, 16 MiB output cache, 24 MiB compressed input limit, 32-million-pixel limit and a small libvips cache. Identical concurrent requests share work. This trades a bounded amount of server CPU for smaller responses.
- Dealer list avatars request previews. Profile data uses an avatar preview; clicking opens the original using the existing authorized endpoint.
- Dealer galleries load previews first. Each item carries its original array index and a content-version hash. The original is fetched individually only when selected. The server checks permission, dealer scope and current version even if a preview has been cached. Photo editing APIs retain original behavior.
- Reclamation detail previews omit inline video bodies and resize images. Video and full-resolution photos load only on click. Edit explicitly fetches original attachments before filling the form; read-only previews must never be saved over originals.
- Commercial-offer images are normalized server-side before caching; the live-offer membership check remains mandatory. The prior 8 MiB download cap was below some existing Google thumbnail responses. A bounded 24 MiB cap plus image resizing handles these larger inputs without modifying Drive originals.

## Queries and data quality

- The main dealer editor's competitor reference request uses a database projection that excludes logo bodies and long descriptive fields. The full competitor page keeps its existing data and edit behavior.
- Nonunique Sales indexes cover month/dealer/custom queries and dealer/month history. Existing documents and duplicate dealer identifiers are unchanged.
- Existing lightweight dealer and reclamation list projections are retained, not represented as newly implemented work.
- Opt-in `CRM_STORAGE_AUDIT_RUN=performance-...` runs read-only diagnostics after startup: top-level field payload sizes, reference-target counts, duplicate dealer-code groups for review, a preview-size sample from the largest gallery and Sales execution statistics compared with a forced collection scan. Reports contain counts/sizes/field names, not record contents or identifiers. Duplicate codes may be intentional network branches; no automatic repair is performed.
- Clear that environment value after measurement. The regular application does not continuously scan records.

## Validation boundaries

Tests exercise real image decoding/resizing, preservation of original buffers, corrupt-image fallback, safe video descriptors, scoped access and stale-version rejection, alongside existing application tests. Production sample ratios and query plans are only claimed after collecting the actual diagnostic output. No backup or production restore success is implied by these optimizations. Database byte size is not expected to fall because originals are preserved.
