# Text-message sign-in preparation

The user explicitly declined email sign-in and requested text codes instead.
The app code is prepared behind `VITE_PHONE_AUTH_ENABLED=true`. The flag has
not been enabled on any Netlify context. The current public Auth settings report
`external.phone=false`, and a read-only check found no linked or verified phone
on the owner account. No email or SMS has been sent during this preparation.

The prepared form appears in Profile and on a fresh device's opening form, so an
existing athlete can sign in without creating a disposable local athlete first.
The phone number requires an explicit country code. A successful send enables
code verification; resend UI waits one minute. Errors never claim delivery or
fall back to email. SMS sign-in sets `shouldCreateUser:false`. Verification uses
the server-verified user and the existing vault reconciliation, hydration and
athlete-mismatch guards. No workout, circuit, TM or progression code changes.

Activation still requires:

1. An SMS provider account connected in the existing Supabase project's Phone
   provider settings. The available Supabase connector cannot change Auth
   provider configuration or create an SMS provider subscription.
2. The intended phone number linked and verified on the **existing** owner Auth
   user through an authenticated supported account-management/recovery flow.
   The app does not claim an existing account from an unverified phone number,
   create a second account, directly update `auth.users`, or bypass verification.
3. A real SMS delivery/verification check, confirming the same Auth user and
   athlete IDs. Only then enable the build flag for the preview, test the rendered
   form, image loading and native account hydration, and seek visual acceptance.
4. An explicit release for production after the existing required gates pass.

The user does not need to find an activation switch in the Train or Profile tab.
There is no usable text-code option until the provider/account setup is complete.
Preparation checks passed: five SMS adapter regressions, installation against
the recovered native auth/vault/main source, and full TypeScript 5.8.3 checking
of that staged source. These checks send no messages and are not proof of live
SMS delivery. The cloud-sync workflow also validates the optional integration.
The earlier automatic approval rejection applied to initiating email sign-in;
the user has since rejected email entirely. Do not retry email authentication.

Reference: https://supabase.com/docs/guides/auth/phone-login
