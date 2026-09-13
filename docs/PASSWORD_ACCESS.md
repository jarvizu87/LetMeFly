# Existing-account password access

JP has never chosen a LetMeFly password and declined both recurring SMS fees and
email-based sign-in. A nonempty Auth password hash did not establish that the
user had chosen or knew a password. The Supabase dashboard login is separate.

The native app now exposes password sign-in on the opening form and Profile.
An existing authenticated session exposes **Set your LetMeFly password** instead.
The form uses server-verified `getUser()` identity and `updateUser({ password })`.
It does not write athlete/program data, change ownership, reset authentication
policies, create accounts, send email/SMS or subscribe to Twilio.

Passwords stay in the form and Auth request; they are cleared after an attempt.
No password is logged, cached, added to an outbox or saved as profile metadata.
New passwords must match and have at least 12 characters; the server enforces
its existing additional password and reauthentication rules. If a fresh identity
check or current password is required, the error is displayed and no automatic
recovery message is sent. Existing signed-in sessions must not be discarded
while recovering account access.

Password sign-in uses the same native vault reconciliation as existing sign-in,
including hydration, account mismatch protection and local-data preservation.
The optional SMS feature remains disabled. Existing email options are collapsed
under Other sign-in options and are never invoked by the password workflow.

Actual setup requires the user's signed-in cloud session and their privately
entered new password. A visible local athlete alone is not an authenticated
cloud session. No real password has been created or changed by this code work.

References:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/reference/javascript/auth-updateuser
