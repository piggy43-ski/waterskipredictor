import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Helper to add delay between requests (rate limit: 2/sec)
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
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <span style="font-size: 48px;">🎿</span>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2a2a4a;">
              <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
                Your Beta Tokens Are Here! 🎉
              </h1>
              
              <p style="color: #a0a0a0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                Hey ${username || 'there'},
              </p>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                Thanks for signing up early for the WaterSki Predictor beta! As a thank you, we've added <strong style="color: #3b82f6;">100 free tokens</strong> to your account.
              </p>
              
              <!-- Token Badge -->
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
                <strong style="color: #3b82f6;">🗓️ Tournament Date:</strong> February 8th, 2026
              </p>
              
              <p style="color: #e0e0e0; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0;">
                <strong style="color: #3b82f6;">🎯 Predictions Open:</strong> Tomorrow! Get ready to make your picks.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" 
                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; padding: 16px 48px; border-radius: 8px;">
                      Explore Tournaments →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
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
    const emailsOnly = body.emailsOnly === true; // Flag to only send emails (tokens already given)

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch all users
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

    // Hardcode the from email to a valid format
    const fromEmail = "noreply@waterskipredictor.com";
    const appUrl = Deno.env.get("APP_URL") || "https://waterskipredictor.lovable.app";

    for (const user of users || []) {
      try {
        if (!emailsOnly) {
          // 1. Get current wallet balance
          const { data: wallet } = await supabaseAdmin
            .from("token_wallets")
            .select("earned_tokens, purchased_tokens")
            .eq("user_id", user.id)
            .single();

          const currentEarned = wallet?.earned_tokens || 0;
          const currentPurchased = wallet?.purchased_tokens || 0;
          const newBalance = currentEarned + currentPurchased + 100;

          // 2. Update wallet - add 100 earned tokens
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

          // 3. Record the transaction
          const { error: txError } = await supabaseAdmin
            .from("token_transactions")
            .insert({
              user_id: user.id,
              type: "bonus",
              amount: 100,
              balance_after: newBalance,
              description: "Beta launch bonus - early signup reward",
            });

          if (txError) {
            console.error(`Transaction record failed for ${user.email}:`, txError);
          }

          results.tokensAwarded++;
        }

        // 4. Send email with rate limiting (wait 600ms between emails to stay under 2/sec)
        if (user.email) {
          await delay(600); // Rate limit: max 2 emails per second
          
          const { error: emailError } = await resend.emails.send({
            from: `WaterSki Predictor <${fromEmail}>`,
            to: [user.email],
            subject: "🎿 Your Beta Tokens Are Here - Tournament Opens Tomorrow!",
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

    console.log("Beta launch complete:", results);

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
