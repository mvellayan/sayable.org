# Sending email from sayable.org (Amazon SES)

Goal: send mail **as `@sayable.org`** (e.g. `noreply@sayable.org`) — OTP codes,
notifications, anything. Today the app sends OTP from `muthu.vellayan@nayalle.com`;
this verifies the `sayable.org` domain in SES so any `@sayable.org` address can send.

Receiving mail at `@sayable.org` is **out of scope** here — this is sending only.

---

## Current status (checked 2026-06-03)

You can **already send from `@sayable.org` right now**:
- `sayable.org` is a verified SES domain identity, **DKIM = SUCCESS**, signing on.
- The account has **production access** (not sandboxed); 50k/day quota.

What's NOT set yet: the custom **MAIL FROM** (`mail.sayable.org`) and **DMARC** —
deliverability improvements, not requirements. `setup_email.sh` is idempotent: it
skips the already-done identity/DKIM and just adds MAIL FROM + SPF + DMARC.

**To start sending now** (no script needed), jump to *Point the app at sayable.org*.

---

## What's required

1. **A verified SES domain identity** for `sayable.org` with **Easy DKIM**
   (3 CNAME records prove ownership and sign every message).
2. **A custom MAIL FROM subdomain** (`mail.sayable.org`) with an **MX** and an
   **SPF** record — better deliverability and SPF alignment.
3. **A DMARC record** (`_dmarc.sayable.org`) — start permissive (`p=none`).
4. **SES production access** — to send to *any* recipient (not just verified
   addresses). New SES accounts start in the **sandbox**. This one already sends
   OTP, so production access is likely granted; verify in the SES console.

All of #1-#3 are scripted. #4 is a one-time manual AWS request (link below).

---

## Run it

```bash
./aws/setup_email.sh
```

It (idempotently):
- creates the SES domain identity for `sayable.org` (Easy DKIM),
- sets the custom MAIL FROM to `mail.sayable.org`,
- writes these records into the Route 53 hosted zone:

| Record | Type | Value |
|--------|------|-------|
| `<token1>._domainkey.sayable.org` | CNAME | `<token1>.dkim.amazonses.com` |
| `<token2>._domainkey.sayable.org` | CNAME | `<token2>.dkim.amazonses.com` |
| `<token3>._domainkey.sayable.org` | CNAME | `<token3>.dkim.amazonses.com` |
| `mail.sayable.org` | MX | `10 feedback-smtp.us-east-1.amazonses.com` |
| `mail.sayable.org` | TXT | `"v=spf1 include:amazonses.com ~all"` |
| `_dmarc.sayable.org` | TXT | `"v=DMARC1; p=none;"` |

---

## Verify (a few minutes after running)

```bash
aws sesv2 get-email-identity --region us-east-1 --email-identity sayable.org \
  --query 'DkimAttributes.Status'
# wait for: "SUCCESS"
```
Also check `MailFromAttributes.MailFromDomainStatus` reaches `SUCCESS`.

---

## Point the app at sayable.org

Once DKIM is `SUCCESS`, update `aws/.env`:

```bash
OTP_SENDER_EMAIL=noreply@sayable.org
NOTIFICATION_SENDER_EMAIL=noreply@sayable.org
```

Then redeploy the backend so the Lambdas pick up the new sender:

```bash
./aws/redeploy.sh --backend-only
```

(The domain identity covers every `@sayable.org` address — no per-address
verification needed.)

---

## Test a send

```bash
aws sesv2 send-email --region us-east-1 \
  --from-email-address "noreply@sayable.org" \
  --destination "ToAddresses=muthu.vellayan@gmail.com" \
  --content '{"Simple":{"Subject":{"Data":"Sayable test"},"Body":{"Text":{"Data":"Hello from sayable.org — SES sending works."}}}}'
```

A successful send prints a `MessageId`. Swap the `ToAddresses` for any recipient.

**Does it work without production access?**
- **Sandbox:** yes, but only to **verified** identities (200/day, 1/s). Check/add
  verified recipients:
  ```bash
  aws sesv2 list-email-identities --region us-east-1 \
    --query "EmailIdentities[].IdentityName" --output text
  aws sesv2 create-email-identity --region us-east-1 --email-identity you@example.com
  # then click the verification link emailed to that address
  ```
- **Production:** any recipient. (This account already has production access —
  `aws sesv2 get-account --region us-east-1 --query ProductionAccessEnabled` → `true`.)

Request production access (if ever needed):
<https://console.aws.amazon.com/ses/home#/account> → **Request production access**.

---

## Tear down

```bash
./aws/destroy_email.sh
```

Removes the DNS records (DKIM, MAIL FROM MX/SPF, DMARC) and deletes the SES
`sayable.org` identity. Does not touch the `nayalle.com` sender, and never
deletes anything else in the zone.
