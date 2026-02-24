import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateEmailHtml = (username: string, appUrl: string) => `
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
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <span style="font-size: 48px;">🎿</span>
            </td>
          </tr>
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2a2a4a;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
                Beta Testing 2 is LIVE! 🎉
              </h1>
              
              <p style="color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                Hey ${username || 'there'},
              </p>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                We've airdropped you <strong style="color: #3b82f6;">100 free tokens</strong> for Beta Testing 2! Get in there and make your predictions before it's too late.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 12px; padding: 20px 40px;">
                      <span style="color: #ffffff; font-size: 32px; font-weight: 700;">+100</span>
                      <span style="color: #ffffff; font-size: 16px; display: block;">Bonus Tokens</span>
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                <strong style="color: #3b82f6;">🎯 Beta Testing 2:</strong> Predictions are open now!
              </p>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0;">
                <strong style="color: #3b82f6;">🗓️ Settlement:</strong> Results will be settled on <strong>Monday</strong>.
              </p>
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" 
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
                You're receiving this because you signed up for the beta.
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const emailsOnly = body.emailsOnly === true;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: users, error: usersError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, username");

    if (usersError) throw usersError;

    console.log(`Processing ${users?.length || 0} users (emailsOnly: ${emailsOnly})`);

    const results = {
      total: users?.length || 0,
      tokensAwarded: 0,
      emailsSent: 0,
      failures: [] as string[],
    };

    const fromEmail = "noreply@waterskipredictor.com";
    const appUrl = Deno.env.get("APP_URL") || "https://waterskipredictor.lovable.app";

    for (const user of users || []) {
      try {
        if (!emailsOnly) {
          const { data: wallet } = await supabaseAdmin
            .from("token_wallets")
            .select("earned_tokens, purchased_tokens")
            .eq("user_id", user.id)
            .single();

          const currentEarned = wallet?.earned_tokens || 0;
          const currentPurchased = wallet?.purchased_tokens || 0;
          const newBalance = currentEarned + currentPurchased + 100;

          const { error: walletError } = await supabaseAdmin
            .from("token_wallets")
            .update({ 
              earned_tokens: currentEarned + 100,
              updated_at: new Date().toISOString()
            })
            .eq("user_id", user.id);

          if (walletError) {
            console.error(`Wallet update failed for ${user.email}:`, walletError);
            results.failures.push(`Wallet: ${user.email}`);
            continue;
          }

          const { error: txError } = await supabaseAdmin
            .from("token_transactions")
            .insert({
              user_id: user.id,
              type: "bonus",
              amount: 100,
              balance_after: newBalance,
              description: "Beta Testing 2 airdrop - 100 bonus tokens",
            });

          if (txError) {
            console.error(`Transaction record failed for ${user.email}:`, txError);
          }

          results.tokensAwarded++;
        }

        if (user.email) {
          await delay(600);
          
          const { error: emailError } = await resend.emails.send({
            from: `WaterSki Predictor <${fromEmail}>`,
            to: [user.email],
            subject: "🎿 Beta Testing 2 is LIVE - 100 Tokens Airdropped!",
            html: generateEmailHtml(user.username || user.email.split("@")[0], appUrl),
          });

          if (emailError) {
            console.error(`Email failed for ${user.email}:`, emailError);
            results.failures.push(`Email: ${user.email}`);
          } else {
            results.emailsSent++;
            console.log(`Email sent to ${user.email}`);
          }
        }
      } catch (userError) {
        console.error(`Failed processing ${user.email}:`, userError);
        results.failures.push(`Processing: ${user.email}`);
      }
    }

    console.log("Beta Testing 2 launch complete:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Beta launch error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
