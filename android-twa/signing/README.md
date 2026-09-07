# Test signing only

`letmefly-test.jks.b64` is intentionally a PUBLIC, TEST-ONLY signing key used for direct Galaxy APK testing and Digital Asset Links verification.

Do not use this key for Google Play or any production release. The permanent Android release must use a private signing key or Google Play App Signing with the production certificate fingerprint added to `/.well-known/assetlinks.json`.
