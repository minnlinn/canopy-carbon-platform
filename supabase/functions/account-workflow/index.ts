import { createClient } from 'npm:@supabase/supabase-js@2';

const appUrl = 'https://canopy-carbon-platform.vercel.app/';
const allowedOrigins = (Deno.env.get('CANOPY_ALLOWED_ORIGINS') || 'https://canopy-carbon-platform.vercel.app,http://127.0.0.1:8765,http://localhost:8765').split(',').map(value => value.trim()).filter(Boolean);
const corsHeaders = (request: Request) => {
  const origin = request.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-canopy-webhook-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
};
const response = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } });

function emailContent(type: string) {
  const welcome = type === 'registration_welcome';
  const subject = welcome ? 'Welcome to Canopy — Your Account Has Been Registered' : 'Your Canopy Account Has Been Verified';
  const body = welcome
    ? '<p>Welcome to Canopy!</p><p>Your account is registered and awaiting verification by our administration team.</p><p>You will receive a further email when the review is complete.</p>'
    : `<p>Your Canopy account has been reviewed and verified.</p><p><a href="${appUrl}" style="display:inline-block;padding:12px 18px;background:#1b513d;color:#fff;text-decoration:none;border-radius:5px;font-weight:700">Access Canopy</a></p>`;
  const text = welcome ? 'Welcome to Canopy. Your account has been registered and is awaiting verification.' : `Your Canopy account has been verified. Access Canopy: ${appUrl}`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f3f6f2;font-family:Arial,sans-serif;color:#24372d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff"><tr><td style="padding:22px 28px;background:#1b513d;color:#fff;font-size:24px;font-weight:700">Canopy</td></tr><tr><td style="padding:28px;font-size:16px;line-height:1.65">${body}<p>Best regards,<br><strong>The Canopy Team</strong></p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

async function authenticatedAdmin(request: Request, supabaseUrl: string, anonKey: string, adminDb: ReturnType<typeof createClient>) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: profileError } = await adminDb.from('profiles').select('role').eq('id', user.id).single();
  return !profileError && profile?.role === 'admin' ? user : null;
}

async function sendNotification(notificationId: string, adminDb: ReturnType<typeof createClient>) {
  const { data: claimed, error: claimError } = await adminDb.rpc('canopy_claim_email_notification', { p_notification_id: notificationId });
  if (claimError) throw claimError;
  const notification = Array.isArray(claimed) ? claimed[0] : null;
  if (!notification) return { skipped: true };
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('CANOPY_EMAIL_FROM');
  if (!resendKey || !from) {
    await adminDb.from('canopy_email_notifications').update({ delivery_status: 'failed', last_error: 'RESEND_API_KEY or CANOPY_EMAIL_FROM is not configured.' }).eq('id', notification.id);
    return { sent: false, reason: 'Email provider is not configured.' };
  }
  try {
    const content = emailContent(notification.notification_type);
    const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': notification.id }, body: JSON.stringify({ from, to: [notification.recipient], ...content }) });
    const result = await sent.json().catch(() => ({}));
    if (!sent.ok) throw new Error(result.message || `Resend returned HTTP ${sent.status}.`);
    await adminDb.from('canopy_email_notifications').update({ delivery_status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.id || null, last_error: null }).eq('id', notification.id).eq('delivery_status', 'sending');
    return { sent: true, messageId: result.id };
  } catch (error) {
    await adminDb.from('canopy_email_notifications').update({ delivery_status: 'failed', last_error: String(error).slice(0, 1000) }).eq('id', notification.id).eq('delivery_status', 'sending');
    return { sent: false, reason: String(error) };
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return response(request, { error: 'Method not allowed.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response(request, { error: 'Server configuration is incomplete.' }, 500);
  const adminDb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return response(request, { error: 'Invalid request body.' }, 400); }

  if (payload.action === undefined && payload.type === 'INSERT') {
    if (request.headers.get('x-canopy-webhook-secret') !== Deno.env.get('CANOPY_WEBHOOK_SECRET')) return response(request, { error: 'Unauthorized webhook.' }, 401);
    const record = payload.record as Record<string, unknown> | undefined;
    if (payload.type !== 'INSERT' || payload.table !== 'canopy_email_notifications' || typeof record?.id !== 'string') return response(request, { error: 'Unsupported webhook event.' }, 400);
    return response(request, await sendNotification(record.id, adminDb));
  }

  const user = await authenticatedAdmin(request, supabaseUrl, anonKey, adminDb);
  if (!user) return response(request, { error: 'Administrator access is required.' }, 403);
  if (payload.action === 'list-account-verification') {
    const [{ data: profiles, error: profilesError }, { data: applications, error: applicationsError }, usersResult, statusesResult, { data: auditRows, error: auditError }] = await Promise.all([
      adminDb.from('profiles').select('id,role,company_name,contact_name,registration_number,sector,verification_status,created_at').in('role', ['sme', 'partner']).order('created_at', { ascending: false }),
      adminDb.from('canopy_account_applications').select('*').order('submitted_at', { ascending: false }),
      adminDb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      adminDb.rpc('canopy_admin_account_statuses'),
      adminDb.from('canopy_account_access_audit').select('id,user_id,admin_id,previous_status,new_status,reason,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1000)
    ]);
    if (profilesError || applicationsError || usersResult.error || statusesResult.error || auditError) return response(request, { error: profilesError?.message || applicationsError?.message || usersResult.error?.message || statusesResult.error?.message || auditError?.message || 'Could not load account records.' }, 400);
    const emailById = new Map((usersResult.data.users || []).map(item => [item.id, item.email || '']));
    const applicationById = new Map((applications || []).map(item => [item.user_id, item]));
    const statusById = new Map((statusesResult.data || []).map((item: { user_id: string; effective_status: string }) => [item.user_id, item.effective_status]));
    const latestAuditById = new Map<string, Record<string, unknown>>();
    for (const audit of auditRows || []) if (!latestAuditById.has(audit.user_id)) latestAuditById.set(audit.user_id, audit);
    return response(request, { data: (profiles || []).map(item => ({ ...item, email: emailById.get(item.id) || '—', application: applicationById.get(item.id) || null, audit: latestAuditById.get(item.id) || null, effective_status: statusById.get(item.id) || 'pending' })) });
  }
  const action = payload.action === 'review-registration' ? payload.decision : payload.changeAction;
  if ((payload.action !== 'change-account-status' && payload.action !== 'review-registration') || typeof payload.profileId !== 'string' || !['approve','reject','suspend','reactivate'].includes(String(action)) || typeof payload.reviewNote !== 'string' || payload.reviewNote.trim().length < 3) return response(request, { error: 'Provide an account, permitted action, and an audit reason of at least three characters.' }, 400);
  const { data, error } = await adminDb.rpc('canopy_admin_change_account_status', { p_admin_id: user.id, p_user_id: payload.profileId, p_action: action, p_reason: payload.reviewNote.trim() });
  if (error) return response(request, { error: error.message }, 409);
  if (action === 'suspend') await adminDb.auth.admin.signOut(payload.profileId, 'global');
  return response(request, { data });
});
