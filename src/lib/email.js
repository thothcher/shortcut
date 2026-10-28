// Sends e-mail through Resend's HTTP API (https://resend.com, free tier: 3,000 e-mails/month).
// Without RESEND_API_KEY the message is printed to the console instead, which is enough for development.
import { config } from '../config.js';

export async function sendEmail({ to, subject, text, html }) {
  if (!config.email.resendApiKey) {
    console.log(`\n[email → ${to}] ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to, subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}
