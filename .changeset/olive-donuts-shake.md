---
"@wildwood/core": minor
---

`DocumentService.upload` accepts React Native file descriptors

`upload` now takes `UploadableFile` — a web `Blob`/`File` or a React Native
`{ uri, name, type }` descriptor, which is appended to `FormData` as-is so RN's
FormData can stream the file off the uri. A `fileName` argument overrides the
descriptor's name without mutating the caller's object. The internal `File`
checks are now guarded with `typeof File !== 'undefined'`, so the service no
longer throws in runtimes without a `File` global. Web `Blob`/`File` uploads are
unchanged.
