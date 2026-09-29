---
"@wildwood/core": patch
---

`AuthErrorCodes.TemporaryPasswordExpired`: the code WildwoodAPI answers a login with when a user's temporary password has expired, so a host can branch on it. Mirrors .NET `AuthErrorCodes.TemporaryPasswordExpired` and Swift `AuthErrorCodes.temporaryPasswordExpired`. The server's own message already reaches the login screen through `WildwoodError.fromResponse`.
