# SMS Magic-Link MFA — Keycloak native provider

A Keycloak **Authenticator SPI** that sends the user a configurable **SMS containing a
signed, single-use, expiring sign-in link**. When the user taps the link, Keycloak's
action-token machinery validates it and completes the authentication — no custom login
page state, no external session store.

Use it as a **second factor** (bind it after password in a flow) or as a passwordless
**first factor**.

## Do I need a separate backend service? — No.

The provider calls your **SMS gateway's HTTP API directly** from inside Keycloak
(`SmsGateway.java`, JDK `HttpClient`). The link is minted and validated by Keycloak itself
(`SmsMagicLinkActionToken` + handler). So:

| Resource | Needed? | Notes |
|----------|---------|-------|
| A backend service you build/host | **No** | The authenticator sends the SMS itself. |
| An SMS gateway account (Twilio / MessageBird / AWS SNS / …) | **Yes** | Third-party; unavoidable — someone has to deliver the text. Configured as a URL + bearer token in the Admin Console. |
| JDK + Maven to build the JAR | Build-time only | Handled by the Docker Maven stage — you don't need them locally. |
| `kc.sh build` after dropping the JAR | **Yes** | Baked into `keycloak/Dockerfile` here. |

## Files

```
src/main/java/com/example/keycloak/smslink/
  SmsMagicLinkAuthenticator.java         username form → mint token → send SMS → info page → success on return
  SmsMagicLinkAuthenticatorFactory.java  registers the authenticator + admin-configurable properties
  SmsMagicLinkActionToken.java           signed, single-use, expiring token (type "sms-magic-link")
  SmsMagicLinkActionTokenHandler.java    validates the tapped link, marks the session, re-enters the flow
  SmsGateway.java                        HTTP call to the SMS provider (swap body shape per provider)
src/main/resources/
  META-INF/services/…AuthenticatorFactory          service registration
  META-INF/services/…ActionTokenHandlerFactory      service registration
  theme-resources/templates/sms-link-username.ftl   "enter username" page
  theme-resources/templates/sms-link-sent.ftl       "check your phone" page
  theme-resources/messages/messages_en.properties   message bundle
```

## Build & deploy (in this repo)

It's wired into `keycloak/Dockerfile` — a Maven stage compiles the JAR and copies it into
`/opt/keycloak/providers/` **before** `kc.sh build`. Just:

```bash
docker compose build keycloak && docker compose up -d keycloak
```

Standalone (outside Docker): `mvn -f keycloak/plugins/sms-magic-link-mfa package`, drop
`target/keycloak-sms-link.jar` into `/opt/keycloak/providers/`, then `kc.sh build`.

## Bind it into a flow

Admin Console → **Authentication** → duplicate the **browser** flow → add execution
**"SMS Magic Link"** → set **Requirement** (REQUIRED as MFA after the password step, or
ALTERNATIVE for passwordless) → open its ⚙ **config** and set the properties below.

## Config properties (per flow, no rebuild)

| Property | Default | Purpose |
|----------|---------|---------|
| SMS message template | `Tap to sign in: {0} (expires in {2} minutes)` | `{0}`=link, `{1}`=username, `{2}`=minutes |
| Link lifetime (seconds) | `300` | Keep short (300–600). |
| Phone number user attribute | `mobile_number` | User attribute holding the E.164 number. |
| SMS gateway URL | — | HTTP endpoint accepting `{to, from, text}` JSON. |
| SMS gateway bearer token | — | Sent as `Authorization: Bearer …` (stored masked). |
| Sender ID | — | Alphanumeric sender or originating number. |

The user needs the phone attribute populated (e.g. `mobile_number`) — declare it in the
realm's user profile.

## Cautions (before production)

- **No rate limiting yet** on send — add a per-user/session throttle or you have an open
  SMS-cost oracle. (Tracked as the first follow-up.)
- **Long URL:** the signed token makes a long link; some carriers truncate. Use a short TTL
  and consider a link shortener.
- **`kc.sh build` is mandatory** after adding/changing the JAR, or the config properties
  won't appear. (Done in the Dockerfile.)
- **Version lockstep:** the pom's `keycloak.version` (26.0.5) must match the server image.
