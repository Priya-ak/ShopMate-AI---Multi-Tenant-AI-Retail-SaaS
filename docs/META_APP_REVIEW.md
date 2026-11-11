# Going Live with Meta: Tech Provider and App Review checklist

Why this exists: until Meta approves the ShopMate app, the one-click "Connect my WhatsApp number" popup shows
**"Shopmate can't onboard customers at the moment"**. That is Meta's gate, not a bug. Work through the steps in order.
Typical total time: days to a few weeks, mostly waiting on Meta.

Until then, shops can use **Manual connect** (Integrations page) with their own Meta app and System User token.
Manual mode has no chat-history import and no phone-app mirroring.

## 0. Publish the public pages (needed by every later step)
- [ ] Edit `src/legal/contact.ts`: set a real, monitored support email.
- [ ] Deploy. Confirm these load without logging in:
  - `https://<your-domain>/privacy`
  - `https://<your-domain>/terms`
  - `https://<your-domain>/data-deletion`
- [ ] Have these pages read by whoever is legally responsible for the business; they are a sound starting point, not legal advice.

## 1. Basic app settings (developers.facebook.com → your app → App settings → Basic)
- [ ] App icon (1024x1024 PNG).
- [ ] Privacy Policy URL = `/privacy` page.
- [ ] Terms of Service URL = `/terms` page.
- [ ] User data deletion → "Data deletion instructions URL" = `/data-deletion` page.
- [ ] Category (e.g. Business and pages) and contact email.
- [ ] App domains: your Vercel domain (no https://).

## 2. Business Verification (business.facebook.com → Settings → Security Centre)
- [ ] Verify the business that owns the app (legal name, address, phone and a document such as registration or utility bill).
- [ ] Earlier the Security Centre said your organisation "does not need to be verified"; once you request Advanced Access
      or Tech Provider status Meta may ask anyway. Start it as soon as the option appears.

## 3. Switch the app to Live
- [ ] Only after steps 1 and 2: toggle **App mode → Live** (top bar of the app dashboard).

## 4. App Review: request Advanced Access
App Review → Permissions and features → request:
- [ ] `whatsapp_business_management`
- [ ] `whatsapp_business_messaging`
- [ ] `business_management` (only if Meta asks for it)

For each, Meta wants a **screencast** and a written explanation. Suggested script (about 2 minutes, English captions):
1. Open ShopMate, sign in as a shop owner.
2. Integrations → Connect my WhatsApp number → complete Embedded Signup (use a test number).
3. From another phone send a WhatsApp message to the connected number.
4. Show the message appear in Conversations and the AI reply arriving on the phone.
5. Reply manually from Conversations and show it arrive on the phone.
6. Click Disconnect WhatsApp.

Suggested use-case text: "ShopMate is a multi-tenant SaaS for retail shops. Shop owners connect their own WhatsApp
Business number so customers can ask about products, stock and orders. We use whatsapp_business_messaging to
receive customer messages and send replies (AI-drafted or typed by staff) inside the 24-hour window, and
whatsapp_business_management to subscribe our app to the owner's WhatsApp Business Account and read the phone number
details. Owners can switch automatic replies off and disconnect at any time."

Provide a **test account** if asked: create a demo shop owner login and share it only in the review form.

## 5. Tech Provider onboarding
- [ ] Developers → your app → Become partner / Tech Provider page (the one you already opened): finish every row that
      shows a to-do (Business Verification, App Review, Access verification).
- [ ] Re-open the Embedded Signup Builder and confirm the configuration (ID in `META_CONFIG_ID`) still shows as active.

## 6. After approval
- [ ] Re-test **Connect my WhatsApp number** with a real number on the WhatsApp Business app.
- [ ] Confirm the Vercel logs show `POST /api/webhooks/whatsapp` and no "invalid signature".
- [ ] Rotate `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_ENCRYPTION_KEY` if they were ever pasted into chat, email or a screenshot
      (rotating the encryption key requires shops to reconnect, so do it before onboarding real shops).
- [ ] Billing: WhatsApp charges per conversation category; add a payment method to the WhatsApp Business Account.

## Common rejection reasons
- Screencast does not show the full flow end to end, or is not in English.
- Privacy policy URL is not public, or does not mention WhatsApp/Meta data.
- Data deletion URL missing.
- App icon or business details inconsistent with the verified business.
