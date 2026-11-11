# WhatsApp integration (use your existing number, keep your chats)

ShopMate connects a store's **existing WhatsApp Business app number** using Meta's **coexistence** feature:
the same number keeps working in the WhatsApp Business app on the owner's phone *and* is connected to the
WhatsApp Cloud API. Existing chats stay on the phone, and (if the owner agrees during sign-up) Meta sends
the old chats and contacts to ShopMate once.

```
Customer's WhatsApp ──► Meta ──┬──► owner's WhatsApp Business app (phone)   (unchanged)
                               └──► POST /api/webhooks/whatsapp  (signed)
                                      └► conversation + messages (per store) ──► Conversations page
                                      └► optional AI auto-reply ──► Cloud API ──► customer (also shows on the phone)
Owner types on the phone ───► Meta ──► webhook field `smb_message_echoes` ──► mirrored into ShopMate
Staff replies in ShopMate ──► Cloud API ──► customer (also shows on the phone)
```

## What the store owner does
1. Make sure the number is on the **WhatsApp Business app** (green "B"), not regular WhatsApp. Switching keeps chats.
2. In ShopMate open **WhatsApp & APIs** → **Connect my WhatsApp number** → sign in with Facebook → scan the QR code with the phone.
3. Keep using the phone as before. Open the Business app at least once every 13 days and do not uninstall it, or the link stops.

Staff can read and reply to chats; only the owner can connect, disconnect or turn AI auto-reply on/off.

## One-time platform setup (the app administrator, not each store)
1. Create a Meta developer app (type Business) at developers.facebook.com and add the **WhatsApp** product.
2. Create an **Embedded Signup** configuration (Facebook Login for Business → Configurations → WhatsApp Embedded Signup).
   Copy its **Configuration ID** → `META_CONFIG_ID`. Copy the **App ID** → `META_APP_ID` and **App Secret** → `META_APP_SECRET`.
3. Webhooks → WhatsApp Business Account: callback URL `https://YOUR-DOMAIN/api/webhooks/whatsapp`, verify token = the value you
   choose for `WHATSAPP_VERIFY_TOKEN`. Subscribe to: `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync`.
4. Add the env vars below in Vercel (Project → Settings → Environment Variables) and redeploy.
5. To onboard stores other than your own, Meta requires the app to be live (Business Verification, `whatsapp_business_management`
   + `whatsapp_business_messaging` advanced access / App Review, and Tech Provider status for a multi-tenant product).
   Until then only people with a role on your Meta app can complete the sign-up.
6. Check `GET /api/health` shows `whatsappConfigured: true` and `whatsappWebhookConfigured: true`.

| Variable | Where | Purpose |
|---|---|---|
| `META_APP_ID` | server (public value) | Starts Embedded Signup in the browser |
| `META_CONFIG_ID` | server (public value) | Embedded Signup configuration |
| `META_APP_SECRET` | **secret** | Exchanges the sign-up code for a token and verifies webhook signatures |
| `WHATSAPP_VERIFY_TOKEN` | **secret** | Meta's one-time webhook handshake |
| `WHATSAPP_ENCRYPTION_KEY` | **secret** (recommended) | Encrypts each store's access token at rest (AES-256-GCM). Falls back to a key derived from `SESSION_SECRET`; changing it later forces stores to reconnect |
| `META_GRAPH_VERSION` | optional | Graph API version, default `v23.0` |

## API
| Method & path | Who | What |
|---|---|---|
| `GET /api/webhooks/whatsapp` | Meta | Verification handshake |
| `POST /api/webhooks/whatsapp` | Meta | Events; rejected unless `X-Hub-Signature-256` is valid |
| `GET /api/whatsapp/status` | owner, staff | Connection state (never returns tokens) |
| `POST /api/whatsapp/connect` | owner | `{code, phone_number_id, waba_id}` from Embedded Signup |
| `PUT /api/whatsapp/settings` | owner | `{auto_reply: boolean}` |
| `DELETE /api/whatsapp/connection` | owner | Disconnect (chats are kept) |
| `POST /api/whatsapp/conversations/:id/reply` | owner, staff | Send a reply (24-hour window enforced) |
| `POST /api/whatsapp/simulate` | owner, staff | Test the AI without Meta; stored as a "simulator" chat |

## Data & security
- `whatsapp_accounts`: one row per store (`business_id` and `phone_number_id` are unique, so a number can belong to only one store). The access token is stored encrypted and is never returned by any endpoint or logged.
- `whatsapp_message_log`: WhatsApp message ids already stored, so Meta retries and duplicate echoes never create duplicate messages.
- Webhooks are accepted only with a valid HMAC signature; the store is chosen from the `phone_number_id` in the payload, never from anything the sender controls. Unknown numbers are acknowledged and ignored.
- Connecting requires the sign-up `code` to be valid **and** the resulting token to be able to read that phone number, so one store cannot claim another's number.
- AI auto-reply is **on by default** for a newly connected shop (the owner can switch it off). Each shop's own assistant answers from that shop's own catalogue, stock and orders. Text messages get an AI answer; photos, voice notes and stickers get a polite "please type what you need" reply. It pauses 15 minutes after a person replies (phone or ShopMate), and is rate limited (10 replies/hour per customer, 300/hour per store).
- Connect, disconnect, auto-reply changes and deletes are written to `audit_logs`.

## Limits to know
- Replies from ShopMate are free-form text and only allowed within **24 hours** of the customer's last message. Outside the window the owner must use an approved template (not built yet).
- Coexistence is not available for every account (new Business-app accounts may not be eligible), does not support the Calling API or the green-tick Official Business Account, and companion devices (e.g. WhatsApp for Windows) are unlinked after onboarding; unsupported companion devices do not produce echoes. See the [360dialog coexistence overview](https://docs.360dialog.com/docs/hub/embedded-signup/whatsapp-coexistence) and [onboarding](https://docs.360dialog.com/docs/hub/embedded-signup/coexistence-onboarding.md).
- Serverless: the webhook does its work (including the AI reply) before answering, within the 30-second function limit. Meta retries failures and the de-duplication makes that safe.
- Messages a customer types **inside the ShopMate app** are stored in Conversations. They are not pushed to the owner's phone automatically (a business-started WhatsApp message outside the 24-hour window needs an approved template). The shopping page has a **Chat on WhatsApp** link so customers can continue in the real WhatsApp thread, which then shows on the phone and in ShopMate.

## NOT verified against live Meta (please test once with a real number)
This was built and tested against simulated Meta payloads and a mock Graph API, not a real Meta app. Confirm these against Meta's current documentation when you onboard your first store:
1. The Embedded Signup options in `IntegrationsPage.tsx` (`featureType: 'whatsapp_business_app_onboarding'`, `sessionInfoVersion: '3'`) and the `WA_EMBEDDED_SIGNUP` browser message.
2. The post-onboarding sync calls (`POST /{phone_number_id}/smb_app_data` with `sync_type` `smb_app_state_sync` / `history`), which are best-effort and only warn on failure.
3. The shape of the `history` and `smb_app_state_sync` webhook payloads (the code is tolerant, but verify one real delivery). Meta's coexistence docs also state the sync time window and which countries are supported.
4. Signature verification on Vercel: the raw request body must reach `server/whatsapp.ts` unmodified. The logs print `invalid signature (body source: …)` if it does not; a `reparsed` source means the platform consumed the body first.
5. The current Graph API version (`META_GRAPH_VERSION`).

## Troubleshooting
| Symptom | Check |
|---|---|
| "not switched on for this platform" | The four `META_*` / verify-token env vars and a redeploy |
| Meta can't verify the webhook | URL is `/api/webhooks/whatsapp` (not `/webhooks/...`); token equals `WHATSAPP_VERIFY_TOKEN` |
| Webhook returns 401 | `META_APP_SECRET` matches the app that sends the events; see "body source" log line |
| Messages not appearing | Webhook fields subscribed; the number's store is connected; `last message received` on the page |
| "access has expired" | The owner disconnects and reconnects WhatsApp |
