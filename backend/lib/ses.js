"use strict";

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const ses = new SESClient({});
const BRAND = process.env.APP_BRAND || "BetterVibe";
const APP_URL = process.env.APP_URL || "https://bettervibe.bettervibe.live";
const OTP_FROM = process.env.OTP_SENDER_EMAIL;
const NOTIFY_FROM =
  process.env.NOTIFICATION_SENDER_EMAIL || process.env.OTP_SENDER_EMAIL;

async function sendEmail({ from, to, subject, html, text }) {
  if (!from) throw new Error("Email sender not configured");
  const cmd = new SendEmailCommand({
    Source: `${BRAND} <${from}>`,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Charset: "UTF-8", Data: subject },
      Body: {
        Html: html ? { Charset: "UTF-8", Data: html } : undefined,
        Text: text ? { Charset: "UTF-8", Data: text } : undefined,
      },
    },
  });
  return ses.send(cmd);
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// OTP email dogfoods DESIGN.md: cream paper background, ink text, gold accent,
// Fraunces italic for the brand, mono for the code. Inline-styled because email
// clients don't load Bunny Fonts.
async function sendOtp(toEmail, code) {
  const subject = `${BRAND} sign-in code: ${code}`;
  const html = `
    <div style="font-family:Georgia,'Iowan Old Style',serif;background:#F4EDDD;color:#1A1614;padding:32px 28px;border-radius:2px;max-width:480px;margin:0 auto;border:1px solid #D9CFB8;">
      <div style="font-style:italic;letter-spacing:0.04em;color:#B08D3B;font-size:22px;margin:0 0 18px;">${BRAND}</div>
      <p style="line-height:1.55;margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">Use the code below to sign in. It expires in 10 minutes.</p>
      <div style="font-family:'SF Mono',Menlo,monospace;font-size:34px;letter-spacing:8px;font-weight:500;margin:24px 0;padding:18px 16px;text-align:center;color:#1A1614;background:#FAF6EC;border:1px solid #D9CFB8;border-radius:2px;">
        ${code}
      </div>
      <p style="font-family:-apple-system,sans-serif;font-size:13px;color:#6E665A;margin:0;line-height:1.4;">If you did not request this code, you can ignore this email.</p>
    </div>`;
  const text = `${BRAND} sign-in code: ${code}\nThis code expires in 10 minutes.`;
  return sendEmail({ from: OTP_FROM, to: toEmail, subject, html, text });
}

async function sendNotification(toEmail, subject, htmlBody, textBody) {
  return sendEmail({
    from: NOTIFY_FROM,
    to: toEmail,
    subject: `${BRAND}: ${subject}`,
    html: htmlBody,
    text: textBody,
  });
}

function appLink(path = "/") {
  return `${APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

module.exports = { sendEmail, sendOtp, sendNotification, appLink, escapeHtml };
