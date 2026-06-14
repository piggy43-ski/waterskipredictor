import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateAnnouncementHtml = (username: string, appUrl: string, tournamentPath: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <span style="font-size: 48px;">🎿</span>
            </td>
          </tr>
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2a2a4a;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
                Swiss Pro Slalom is Open! 🏆
              </h1>
              
              <p style="color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                Hey ${username || 'there'},
              </p>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Predictions are now open for <strong style="color: #3b82f6;">Swiss Pro Slalom</strong>! Get in early and lock in your picks before the action starts.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 12px; padding: 20px 40px;">
                      <span style="color: #ffffff; font-size: 24px; font-weight: 700;">🎯 Predictions Open</span>
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0;">
                Pick your winners in Slalom — Nate and Charlie are neck-and-neck as favorites. Who's your pick?
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}${tournamentPath}" 
                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; padding: 16px 48px; border-radius: 8px;">
                      Make Your Predictions →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 32px; text-align: center;">
              <p style="color: #666666; font-size: 14px; margin: 0;">
                WaterSki Predictor - Where Every Pass Matters
              </p>
              <p style="color: #444444; font-size: 12px; margin: 8px 0 0 0;">
                You're receiving this because you opted in to marketing emails.
                <br>To unsubscribe, update your email preferences in your profile settings.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;


const generateCustomHtml = (username: string, appUrl: string, emoji: string, cardHtml: string) => {
  const card = (cardHtml || "")
    .replace(/\{\{username\}\}/g, username || "there")
    .replace(/\{\{appUrl\}\}/g, appUrl);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
        <tr><td align="center" style="padding-bottom:28px;"><span style="font-size:44px;">${emoji || "🏆"}</span></td></tr>
        <tr><td style="background:linear-gradient(135deg,#02141a 0%,#001920 100%);border-radius:16px;padding:40px;border:1px solid rgba(0,230,240,0.28);">
          ${card}
        </td></tr>
        <tr><td style="padding-top:32px;text-align:center;">
          <p style="color:#666;font-size:14px;margin:0;">WaterSki Predictor — Where Every Pass Matters</p>
          <p style="color:#444;font-size:12px;margin:8px 0 0 0;">You're receiving this because you opted in to marketing emails.<br>To unsubscribe, update your email preferences in your profile settings.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Admin-only guard
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const { data: role } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize ?? 100;
    const rawPath = body.tournamentPath ?? "/tournaments/76329f1b-a36d-4232-b1f8-5ced4484fd4d";
    // Restrict tournamentPath to safe internal paths only.
    const tournamentPath = /^\/tournaments\/[a-zA-Z0-9-]+$/.test(rawPath)
      ? rawPath
      : "/tournaments";
    const sendToAll = body.sendToAll === true;
    const campaignId = body.campaignId ?? "swiss-pro-slalom-2026";
    // --- generic campaign overrides (backward compatible) ---
    const customSubject: string | null = typeof body.subject === "string" ? body.subject : null;
    const customEmoji: string = typeof body.emoji === "string" ? body.emoji : "🏆";
    const customCardHtml: string | null = typeof body.cardHtml === "string" ? body.cardHtml : null;
    const dedupeSubjectLike: string = typeof body.dedupeSubjectLike === "string" ? body.dedupeSubjectLike : "%Swiss Pro Slalom%";
    const testEmail: string | null = typeof body.testEmail === "string" ? body.testEmail : null;

    // Fetch profiles with email preferences - respect marketing opt-in
    const { data: users, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select(`
        id, email, username,
        email_preferences!left (marketing)
      `)
      .order("created_at", { ascending: true });

    if (usersError) throw usersError;

    // Fetch already-sent emails to deduplicate
    const { data: alreadySent } = await supabaseAdmin
      .from("email_logs")
      .select("recipient")
      .eq("email_type", "announcement")
      .in("status", ["sent", "failed"])
      .like("subject", dedupeSubjectLike);
    
    const alreadySentSet = new Set((alreadySent || []).map((r: any) => r.recipient));

    // Filter users based on sendToAll flag and dedup
    const eligibleUsers = (users || []).filter((u: any) => {
      if (!u.email) return false;
      if (alreadySentSet.has(u.email)) return false;
      if (sendToAll) return true;
      const prefs = u.email_preferences;
      if (!prefs || (Array.isArray(prefs) && prefs.length === 0)) return true;
      const pref = Array.isArray(prefs) ? prefs[0] : prefs;
      return pref.marketing !== false;
    });

    // TEST MODE: send only to testEmail (skip dedup + logging) for a visual check.
    const isTest = !!testEmail;
    const batch = isTest
      ? [{ id: null, email: testEmail, username: "Rizzi" }]
      : eligibleUsers.slice(0, batchSize);
    const remaining = isTest ? 0 : (eligibleUsers.length - batch.length);

    console.log(`Announcement: ${eligibleUsers.length} eligible, sending batch of ${batch.length}`);

    const fromEmail = "noreply@waterskipredictor.com";
    const appUrl = Deno.env.get("APP_URL") || "https://waterskipredictor.lovable.app";
    const subject = customSubject ?? "🎿 Swiss Pro Slalom is Open for Predictions!";

    let sent = 0;
    const failures: string[] = [];

    for (const user of batch) {
      try {
        await delay(800);

        const html = customCardHtml
          ? generateCustomHtml(user.username || user.email.split("@")[0], appUrl, customEmoji, customCardHtml)
          : generateAnnouncementHtml(user.username || user.email.split("@")[0], appUrl, tournamentPath);

        const { data: emailResult, error: emailError } = await resend.emails.send({
          from: `WaterSki Predictor <${fromEmail}>`,
          to: [user.email],
          subject,
          html,
        });

        if (emailError) {
          console.error(`Email failed for ${user.email}:`, emailError);
          failures.push(user.email);

          if (!isTest) await supabaseAdmin.from("email_logs").insert({
            user_id: user.id,
            recipient: user.email,
            email_type: "announcement",
            subject,
            status: "failed",
            error_message: JSON.stringify(emailError),
          });
        } else {
          sent++;
          console.log(`Sent to ${user.email}`);

          if (!isTest) await supabaseAdmin.from("email_logs").insert({
            user_id: user.id,
            recipient: user.email,
            email_type: "announcement",
            subject,
            status: "sent",
            resend_id: emailResult?.id || null,
          });
        }
      } catch (err: any) {
        console.error(`Error processing ${user.email}:`, err);
        failures.push(user.email);
      }
    }

    const result = {
      sent,
      failures: failures.length,
      failedEmails: failures,
      remaining: Math.max(0, remaining),
      totalEligible: eligibleUsers.length,
      campaignId,
    };

    console.log("Announcement batch complete:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Announcement error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
