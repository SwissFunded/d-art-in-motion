import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

function str(v: unknown): string {
  if (v == null) return '';
  try { return String(v); } catch { return '' }
}

export async function POST(req: NextRequest) {
  try {
    const configuredSecret = process.env.WEBHOOK_SECRET || '';
    const incomingSecret = req.headers.get('x-webhook-secret') || '';
    if (configuredSecret && incomingSecret !== configuredSecret) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const payload = await req.json().catch(() => ({} as any));
    // Try a few common shapes used by Supabase webhooks
    const record = payload?.record || payload?.new || payload?.data?.new || payload?.row || payload;

    const nummer = record?.nummer;
    const artist = record?.artist_name;
    const fromLoc = record?.old_location;
    const toLoc = record?.new_location;
    const changedAt = record?.changed_at || new Date().toISOString();

    const title = `Artwork moved${nummer ? ` #${nummer}` : ''}${artist ? ` — ${artist}` : ''}`;
    const bodyText = [
      fromLoc ? `From: ${str(fromLoc)}` : null,
      toLoc ? `To: ${str(toLoc)}` : null,
      changedAt ? `At: ${new Date(changedAt).toLocaleString()}` : null,
    ].filter(Boolean).join('\n');

    // 1) Email via Resend (if configured)
    const resendKey = process.env.RESEND_API_KEY;
    const emailTo = process.env.NOTIFY_EMAIL_TO;
    const emailFrom = process.env.NOTIFY_EMAIL_FROM;
    if (resendKey && emailTo && emailFrom) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: emailFrom,
        to: emailTo,
        subject: title,
        text: bodyText || title,
      });
    }

    // 2) Push via Pushover (optional)
    const pushToken = process.env.PUSHOVER_TOKEN;
    const pushUser = process.env.PUSHOVER_USER;
    if (pushToken && pushUser) {
      await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: pushToken,
          user: pushUser,
          title,
          message: bodyText || title,
          priority: 0,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Webhook error', e);
    return new NextResponse('Server error', { status: 500 });
  }
}


