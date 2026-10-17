import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-canopy-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const appUrl = 'https://canopy-carbon-platform.vercel.app/';
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const adminDb = createClient(supabaseUrl, serviceRoleKey);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function emailContent(type: string) {
  const welcome = type === 'registration_welcome';
  const subject = welcome
    ? 'Welcome to Canopy — Your Account Has Been Registered'
    : 'Your Canopy Account Has Been Verified';
  const body = welcome
    ? `<p>Welcome to Canopy!</p><p>Thank you for registering with Canopy, your platform for accessing carbon-credit projects and managing carbon-related activities.</p><p>Your account has been successfully registered and is currently awaiting verification by our administration team.</p><p>Once your account has been reviewed and approved, you will receive another email confirming that your account has been verified.</p><p>In the meantime, you may sign in to view your account status and explore any features available to unverified users.</p><p>Thank you for joining Canopy. We look forward to supporting your sustainability journey.</p>`
    : `<p>We are pleased to inform you that your Canopy account has been successfully reviewed and verified.</p><p>You can now sign in to Canopy and access the features available to your account.</p><p><a href="${appUrl}" style="display:inline-block;padding:12px 18px;background:#1b513d;color:#fff;text-decoration:none;border-radius:5px;font-weight:700">Access Canopy</a></p><p>Depending on your account type, you can explore carbon-credit projects, manage your portfolio, access reporting tools or use Partner services.</p><p>Thank you for being part of Canopy. We look forward to supporting your carbon management and sustainability activities.</p>`;
  const text = welcome
    ? 'Welcome to Canopy! Thank you for registering with Canopy, your platform for accessing carbon-credit projects and managing carbon-related activities. Your account has been successfully registered and is currently awaiting verification by our administration team. Once your account has been reviewed and approved, you will receive another email confirming that your account has been verified. In the meantime, sign in to view your account status and explore any features available to unverified users. Thank you for joining Canopy. We look forward to supporting your sustainability journey.\n\nBest regards,\nThe Canopy Team'
    : `Your Canopy account has been successfully reviewed and verified. Sign in to access the features available to your account: ${appUrl}\n\nDepending on your account type, explore carbon-credit projects, manage your portfolio, access reporting tools or use Partner services. Thank you for being part of Canopy.\n\nBest regards,\nThe Canopy Team`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f6f2;font-family:Arial,sans-serif;color:#24372d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f2;padding:24px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dfe8df"><tr><td style="padding:22px 28px;background:#1b513d;color:#fff;font-size:24px;font-weight:700">Canopy</td></tr><tr><td style="padding:28px;font-size:16px;line-height:1.65">${body}<p style="margin:28px 0 0">Best regards,<br><strong>The Canopy Team</strong></p></td></tr><tr><td style="padding:16px 28px;background:#f3f6f2;color:#607168;font-size:12px">Canopy · Carbon asset platform</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

async function sendNotification(notificationId: string) {
  const { data: claimed, error: claimError } = await adminDb
    .rpc('canopy_claim_email_notification', { p_notification_id: notificationId });
  if (claimError) throw claimError;
  const notification = Array.isArray(claimed) ? claimed[0] : null;
  if (!notification) return { skipped: true };

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('CANOPY_EMAIL_FROM');
  if (!resendKey || !from) {
    await adminDb.from('canopy_email_notifications').update({
      delivery_status: 'failed',
      last_error: 'RESEND_API_KEY or CANOPY_EMAIL_FROM is not configured.',
    }).eq('id', notification.id);
    return { sent: false, reason: 'Email provider is not configured.' };
  }

  try {
    const content = emailContent(notification.notification_type);
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': notification.id,
      },
      body: JSON.stringify({
        from,
        to: [notification.recipient],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    });
    const resultBody = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(resultBody.message || `Resend returned HTTP ${result.status}.`);
    const { error } = await adminDb.from('canopy_email_notifications').update({
      delivery_status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: resultBody.id || null,
      last_error: null,
    }).eq('id', notification.id).eq('delivery_status', 'sending');
    if (error) throw error;
    return { sent: true, messageId: resultBody.id };
  } catch (error) {
    await adminDb.from('canopy_email_notifications').update({
      delivery_status: 'failed',
      last_error: String(error).slice(0, 1000),
    }).eq('id', notification.id).eq('delivery_status', 'sending');
    return { sent: false, reason: String(error) };
  }
}

async function authenticatedAdmin(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await adminDb
    .from('profiles').select('role').eq('id', user.id).single();
  if (profileError || profile?.role !== 'admin') return null;
  return user;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response({ error: 'Invalid request body.' }, 400);
  }

  if (request.headers.get('x-canopy-webhook-secret')) {
    const expectedSecret = Deno.env.get('CANOPY_WEBHOOK_SECRET');
    if (!expectedSecret || request.headers.get('x-canopy-webhook-secret') !== expectedSecret) {
      return response({ error: 'Unauthorized webhook.' }, 401);
    }
    const record = payload.record as Record<string, unknown> | undefined;
    if (payload.type !== 'INSERT' || payload.table !== 'canopy_email_notifications' || typeof record?.id !== 'string') {
      return response({ error: 'Unsupported webhook event.' }, 400);
    }
    const result = await sendNotification(record.id);
    return response(result);
  }

  const user = await authenticatedAdmin(request);
  if (!user) return response({ error: 'Administrator access is required.' }, 403);

  if (payload.action === 'verify' && typeof payload.profileId === 'string') {
    const { data, error } = await adminDb.rpc('canopy_approve_profile', {
      p_profile_id: payload.profileId,
      p_review_note: typeof payload.reviewNote === 'string' ? payload.reviewNote.slice(0, 1000) : null,
    });
    if (error) return response({ error: error.message }, 409);
    return response({ ...data, notification: 'queued' });
  }

  if (payload.action === 'review-registration'
      && typeof payload.profileId === 'string'
      && ['approve', 'reject'].includes(String(payload.decision))) {
    const { data, error } = await adminDb.rpc('canopy_admin_review_registration', {
      p_admin_id: user.id,
      p_user_id: payload.profileId,
      p_decision: payload.decision,
      p_note: typeof payload.reviewNote === 'string' ? payload.reviewNote.slice(0, 1000) : '',
    });
    if (error) return response({ error: error.message }, 409);
    return response({ ...data, notification: payload.decision === 'approve' ? 'queued-if-configured' : 'not-sent' });
  }

  if (payload.action === 'retry' && typeof payload.notificationId === 'string') {
    const { data: reset, error } = await adminDb.from('canopy_email_notifications')
      .update({ delivery_status: 'pending', last_error: null })
      .eq('id', payload.notificationId).eq('delivery_status', 'failed')
      .select('id').maybeSingle();
    if (error) return response({ error: error.message }, 500);
    if (!reset) return response({ error: 'Only failed notifications can be retried.' }, 409);
    return response(await sendNotification(reset.id));
  }

  return response({ error: 'Unsupported action.' }, 400);
});
