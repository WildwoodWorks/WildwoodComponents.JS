# @wildwood/node

Server-side SDK for Node.js. Express middleware for JWT validation and API proxying.

## Key Files

- `src/middleware/authMiddleware.ts` - Express middleware: validates JWT via API, attaches user to req
- `src/middleware/proxyMiddleware.ts` - Proxies client requests with server-side apiKey
- `src/utils/tokenValidator.ts` - JWT decode/validation without API call (claims only)
- `src/admin/adminClient.ts` - Server-side admin operations

## Conventions

- Express is an optional peerDep (middleware types imported from @types/express)
- Token validation delegates to WildwoodAPI `/api/auth/validate` endpoint
- `tokenValidator.ts` does local JWT decode only (no crypto verification) - use for extracting claims
- AdminClient uses apiKey header for server-to-server auth
