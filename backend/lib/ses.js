"use strict";

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const ses = new SESClient({});
const BRAND = process.env.APP_BRAND || "Sayable";
const APP_URL = process.env.APP_URL || "https://sayable.org";
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
  // Reskinned to DESIGN.md: warm paper (#F6F2EA), ink (#1F1B16), clay accent only
  // where it earns it, Newsreader serif for the brand/emotional line, Hanken
  // Grotesk (with safe fallbacks) for UI. Calm and literary — never alarmed.
  const html = `
    <div style="font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;background:#F6F2EA;color:#1F1B16;padding:40px 28px;max-width:480px;margin:0 auto;">
      <div style="font-family:'Newsreader',Georgia,'Times New Roman',serif;font-weight:500;font-size:24px;letter-spacing:-0.01em;color:#1F1B16;margin:0 0 4px;">${BRAND}</div>
      <div style="font-family:'Newsreader',Georgia,'Times New Roman',serif;font-style:italic;color:#6B6358;font-size:16px;margin:0 0 28px;">Say the hard thing so it can actually be heard.</div>
      <p style="font-size:16px;line-height:1.6;margin:0 0 4px;color:#1F1B16;">Your sign-in code:</p>
      <div style="font-size:34px;letter-spacing:10px;font-weight:600;text-align:center;color:#1F1B16;background:#FBF8F2;border:1px solid #E7E0D3;border-radius:10px;padding:20px 16px;margin:14px 0 10px;">
        ${code}
      </div>
      <p style="font-size:14px;color:#6B6358;margin:0 0 28px;line-height:1.5;">It expires in 10 minutes.</p>
      <div style="border-top:1px solid #E7E0D3;height:0;line-height:0;margin:0 0 16px;">&nbsp;</div>
      <p style="font-size:13px;color:#6B6358;margin:0;line-height:1.5;">If you didn't request this, you can ignore this email.</p>
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
