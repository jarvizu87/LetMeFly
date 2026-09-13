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

## New-account registration

The opening screen and signed-out Profile now offer **Sign In** and **Register**.
Register collects an account email, a new password and confirmation, and uses
native `signUp` followed by server identity verification and the existing vault
reconciliation. It does not reset an existing account or reassign athlete data.
Signed-in accounts cannot register over their active session. Passwords are
cleared after submission or switching forms and are never stored as app data.

JP requested access without email messages. Registration therefore checks the
public Auth settings before enabling submission and checks them again before
sign-up. It proceeds only when email/password is enabled, signups are open and
`mailer_autoconfirm` is true. **Check again** refreshes availability after setup.
It fails closed if settings are unavailable or confirmation is required.

The connected project's settings were checked on 2026-09-13: signups and email
authentication are enabled, but `mailer_autoconfirm` is false. To activate this
registration flow, the project owner must disable **Confirm email** in Supabase
Authentication settings. This allows new addresses to register without verifying
the address. Connected tools do not expose an Auth-configuration mutation, so no
server policy was changed. No account or email was created during verification.

Register is for new accounts. Existing cloud history and private pictures remain
with the original account; choosing Register does not recover its password.
The attached September 11 backup contains workout history and training maxes,
but no exercise image records or image files. A new-account transfer must handle
private pictures separately and verify record identity mapping before cloud sync.

References:
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/reference/javascript/auth-updateuser

## Forgotten-password recovery

Opening Sign In and signed-out Profile now include **Forgot password?**. JP
requested this to regain access to the existing account. An existing signed-in
device can still set a new password in Profile without requesting an email.
Signed-out recovery uses a one-time email only after the user presses **SEND
RESET EMAIL**; opening the form sends nothing. It does not create another account,
change signup policy, or reset a Supabase dashboard password.

The reset request uses native `resetPasswordForEmail` with this app origin and
path, a recovery marker, and the Profile route. A marked callback exchanges its
PKCE code and verifies the returned identity with `getUser`. The pinned client's
`sb_flow_id` is passed through explicitly, and all callback query/fragment
credentials are removed from the address before the exchange. Expired links and
failed verification show recovery-specific errors and preserve local data.

If a phone opens email in a different browser or a redirect goes to the wrong
site, the optional **Having trouble opening the reset link?** section accepts the
original, unused recovery link copied from the email. It accepts only HTTPS
recovery links for this configured project's `/auth/v1/verify`, calls native
`verifyOtp({ token_hash, type: 'recovery' })`, and verifies the server identity.
It never fetches or navigates to the pasted URL or its `redirect_to` value. The
input is masked and cleared immediately. Recovery codes, links and passwords
are never logged or stored as application data.

Only a verified session exposes **SAVE NEW PASSWORD**, using the same guarded
password update and native athlete reconciliation as existing password access.
Server password and reauthentication policies remain in force. Authenticated
devices cannot replace their current session through the recovery form.

Verification uses fake Auth responses and disposable local data, including
invalid/used links, account changes, native vault mismatch protection and both
opening-screen widths. No real recovery email was requested and no real password
was changed. Actual email delivery depends on the project's existing email
service; redirect URLs must be allowed by Supabase. No email templates, provider
settings, or live production deployment were changed by this work.

Recovery references:
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://supabase.com/docs/guides/auth/passwords
