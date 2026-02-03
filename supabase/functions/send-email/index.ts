import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EmailType = "welcome" | "bet_confirmation" | "bet_result" | "redemption_receipt";

interface EmailRequest {
  type: EmailType;
  to: string;
  userId?: string;
  data: Record<string, any>;
}

// Validate required environment variables upfront
function getRequiredEnvVars(): { fromEmail: string; appUrl: string; resendApiKey: string } {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");
  const appUrl = Deno.env.get("APP_URL");
  
  const missing: string[] = [];
  if (!resendApiKey) missing.push("RESEND_API_KEY");
  if (!fromEmail) missing.push("FROM_EMAIL");
  if (!appUrl) missing.push("APP_URL");
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}. Configure these in Lovable Cloud secrets.`);
  }
  
  return { fromEmail: fromEmail!, appUrl: appUrl!, resendApiKey: resendApiKey! };
}

// Generate HTML templates directly (avoiding npm import issues)
function generateWelcomeEmail(data: { username: string; appUrl: string }): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 28px; font-weight: bold; color: #3b82f6;">🎿 WaterSki Predictor</span>
    </div>
    
    <h1 style="color: #ffffff; font-size: 24px; font-weight: bold; text-align: center; margin: 0 0 24px;">
      Welcome to WaterSki Predictor, ${data.username}!
    </h1>
    
    <p style="color: #d1d5db; font-size: 16px; line-height: 26px; margin: 16px 0;">
      Thanks for joining the ultimate water ski prediction platform. We're excited to have you on board!
    </p>
    
    <p style="color: #d1d5db; font-size: 16px; line-height: 26px; margin: 16px 0;">
      To start making predictions on your favorite water ski athletes, grab some tokens and jump into the action.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.appUrl}/wallet" style="background-color: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; display: inline-block;">
        Buy Tokens to Start
      </a>
    </div>
    
    <p style="color: #d1d5db; font-size: 16px; margin: 16px 0;"><strong>What you can do:</strong></p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Predict winners at upcoming tournaments</p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Compete in fantasy leagues with other fans</p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Track athlete stats and performance</p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Redeem winnings for exclusive rewards</p>
    
    <div style="color: #6b7280; font-size: 14px; line-height: 24px; margin-top: 40px; text-align: center; border-top: 1px solid #374151; padding-top: 24px;">
      See you on the water!<br>
      The WaterSki Predictor Team
    </div>
  </div>
</body>
</html>`;
}

function generateBetConfirmationEmail(data: {
  username: string;
  athleteName: string;
  tournamentName: string;
  discipline: string;
  marketType: string;
  stakedTokens: number;
  potentialPayout: number;
  odds: number;
  appUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 28px; font-weight: bold; color: #3b82f6;">🎿 WaterSki Predictor</span>
    </div>
    
    <h1 style="color: #ffffff; font-size: 24px; font-weight: bold; text-align: center; margin: 0 0 24px;">
      Prediction Confirmed!
    </h1>
    
    <p style="color: #d1d5db; font-size: 16px; line-height: 26px; margin: 16px 0;">
      Hey ${data.username}, your prediction has been placed successfully.
    </p>
    
    <div style="background-color: #1f2937; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #ffffff; font-size: 18px; font-weight: bold; margin: 0 0 16px; text-align: center;">Prediction Details</p>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Athlete</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.athleteName}</td></tr>
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Tournament</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.tournamentName}</td></tr>
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Discipline</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.discipline}</td></tr>
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Market</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.marketType}</td></tr>
      </table>
      
      <div style="border-top: 1px solid #374151; margin: 16px 0;"></div>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Staked</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.stakedTokens.toLocaleString()} tokens</td></tr>
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Odds</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.odds.toFixed(2)}x</td></tr>
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Potential Win</td><td style="color: #22c55e; font-size: 16px; font-weight: bold; text-align: right; padding: 4px 0;">${data.potentialPayout.toLocaleString()} tokens</td></tr>
      </table>
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.appUrl}/predictions" style="background-color: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; display: inline-block;">
        View My Predictions
      </a>
    </div>
    
    <div style="color: #6b7280; font-size: 14px; line-height: 24px; margin-top: 40px; text-align: center; border-top: 1px solid #374151; padding-top: 24px;">
      Good luck!<br>
      The WaterSki Predictor Team
    </div>
  </div>
</body>
</html>`;
}

function generateBetResultEmail(data: {
  username: string;
  athleteName: string;
  tournamentName: string;
  result: 'won' | 'lost' | 'void';
  stakedTokens: number;
  payoutTokens?: number;
  appUrl: string;
}): string {
  const isWin = data.result === 'won';
  const isVoid = data.result === 'void';
  
  const emoji = isWin ? '🎉' : isVoid ? '↩️' : '😔';
  const title = isWin ? 'You Won!' : isVoid ? 'Prediction Voided' : 'Better Luck Next Time';
  const bgColor = isWin ? '#14532d' : isVoid ? '#1e3a5f' : '#7f1d1d';
  
  let resultContent = '';
  if (isWin) {
    resultContent = `
      <p style="color: rgba(255,255,255,0.7); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">You Won</p>
      <p style="color: #ffffff; font-size: 36px; font-weight: bold; margin: 0 0 8px;">${data.payoutTokens?.toLocaleString()} tokens</p>
      <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0;">Staked: ${data.stakedTokens.toLocaleString()} tokens</p>
    `;
  } else if (isVoid) {
    resultContent = `
      <p style="color: rgba(255,255,255,0.7); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Refunded</p>
      <p style="color: #ffffff; font-size: 36px; font-weight: bold; margin: 0 0 8px;">${data.stakedTokens.toLocaleString()} tokens</p>
      <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0;">Full stake returned to your wallet</p>
    `;
  } else {
    resultContent = `
      <p style="color: rgba(255,255,255,0.7); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Lost</p>
      <p style="color: #ffffff; font-size: 36px; font-weight: bold; margin: 0 0 8px;">${data.stakedTokens.toLocaleString()} tokens</p>
      <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0;">Don't worry, there's always next time!</p>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 28px; font-weight: bold; color: #3b82f6;">🎿 WaterSki Predictor</span>
    </div>
    
    <p style="font-size: 48px; text-align: center; margin: 0 0 16px;">${emoji}</p>
    <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; text-align: center; margin: 0 0 24px;">
      ${title}
    </h1>
    
    <p style="color: #d1d5db; font-size: 16px; line-height: 26px; margin: 16px 0; text-align: center;">
      Hey ${data.username}, your prediction on <strong>${data.athleteName}</strong> at ${data.tournamentName} has been settled.
    </p>
    
    <div style="background-color: ${bgColor}; border-radius: 12px; padding: 32px; margin: 24px 0; text-align: center;">
      ${resultContent}
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.appUrl}/tournaments" style="background-color: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; display: inline-block;">
        ${isWin ? 'Make More Predictions' : 'Try Again'}
      </a>
    </div>
    
    <div style="color: #6b7280; font-size: 14px; line-height: 24px; margin-top: 40px; text-align: center; border-top: 1px solid #374151; padding-top: 24px;">
      ${isWin ? 'Keep the winning streak going!' : 'Keep predicting, champions never give up!'}<br>
      The WaterSki Predictor Team
    </div>
  </div>
</body>
</html>`;
}

function generateRedemptionReceiptEmail(data: {
  username: string;
  rewardName: string;
  rewardDescription: string;
  tokensSpent: number;
  partnerName: string;
  redemptionId: string;
  appUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 28px; font-weight: bold; color: #3b82f6;">🎿 WaterSki Predictor</span>
    </div>
    
    <p style="font-size: 48px; text-align: center; margin: 0 0 16px;">🎁</p>
    <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; text-align: center; margin: 0 0 24px;">
      Reward Redeemed!
    </h1>
    
    <p style="color: #d1d5db; font-size: 16px; line-height: 26px; margin: 16px 0; text-align: center;">
      Hey ${data.username}, your redemption has been processed successfully.
    </p>
    
    <div style="background-color: #1f2937; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px; text-align: center;">Redemption Receipt</p>
      
      <div style="text-align: center; margin-bottom: 16px;">
        <p style="color: #ffffff; font-size: 20px; font-weight: bold; margin: 0 0 8px;">${data.rewardName}</p>
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">${data.rewardDescription}</p>
      </div>
      
      <div style="border-top: 1px solid #374151; margin: 16px 0;"></div>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Partner</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.partnerName}</td></tr>
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Tokens Spent</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.tokensSpent.toLocaleString()}</td></tr>
        <tr><td style="color: #9ca3af; font-size: 14px; padding: 4px 0;">Redemption ID</td><td style="color: #ffffff; font-size: 14px; text-align: right; padding: 4px 0;">${data.redemptionId.slice(0, 8).toUpperCase()}</td></tr>
      </table>
    </div>
    
    <div style="color: #d1d5db; font-size: 14px; line-height: 24px; margin: 24px 0; background-color: #1e3a5f; padding: 16px; border-radius: 8px;">
      <strong>What's next?</strong><br>
      Our team will process your redemption and you'll receive further instructions within 2-3 business days. You can track the status in your profile.
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.appUrl}/profile" style="background-color: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; display: inline-block;">
        View Redemption Status
      </a>
    </div>
    
    <div style="color: #6b7280; font-size: 14px; line-height: 24px; margin-top: 40px; text-align: center; border-top: 1px solid #374151; padding-top: 24px;">
      Thank you for being part of our community!<br>
      The WaterSki Predictor Team
    </div>
  </div>
</body>
</html>`;
}

function getEmailContent(type: EmailType, data: Record<string, any>, appUrl: string): { html: string; subject: string } {
  switch (type) {
    case "welcome":
      return {
        html: generateWelcomeEmail({
          username: data.username || "Champion",
          appUrl,
        }),
        subject: "Welcome to WaterSki Predictor! 🎿",
      };
    
    case "bet_confirmation":
      return {
        html: generateBetConfirmationEmail({
          username: data.username || "Champion",
          athleteName: data.athleteName || "Athlete",
          tournamentName: data.tournamentName || "Tournament",
          discipline: data.discipline || "Unknown",
          marketType: data.marketType || "Winner",
          stakedTokens: data.stakedTokens || 0,
          potentialPayout: data.potentialPayout || 0,
          odds: data.odds || 1,
          appUrl,
        }),
        subject: `Prediction Confirmed: ${data.athleteName || 'Your Pick'}`,
      };
    
    case "bet_result": {
      const resultEmoji = data.result === "won" ? "🎉" : data.result === "void" ? "↩️" : "";
      const subjectPrefix = data.result === "won" ? "You Won!" : data.result === "void" ? "Prediction Voided" : "Prediction Result";
      return {
        html: generateBetResultEmail({
          username: data.username || "Champion",
          athleteName: data.athleteName || "Athlete",
          tournamentName: data.tournamentName || "Tournament",
          result: data.result || "lost",
          stakedTokens: data.stakedTokens || 0,
          payoutTokens: data.payoutTokens,
          appUrl,
        }),
        subject: `${resultEmoji} ${subjectPrefix}: ${data.athleteName || 'Your Pick'}`,
      };
    }
    
    case "redemption_receipt":
      return {
        html: generateRedemptionReceiptEmail({
          username: data.username || "Champion",
          rewardName: data.rewardName || "Reward",
          rewardDescription: data.rewardDescription || "",
          tokensSpent: data.tokensSpent || 0,
          partnerName: data.partnerName || "Partner",
          redemptionId: data.redemptionId || "unknown",
          appUrl,
        }),
        subject: `🎁 Reward Redeemed: ${data.rewardName || 'Your Reward'}`,
      };
    
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

async function checkEmailPreferences(
  supabase: any,
  userId: string,
  emailType: EmailType
): Promise<boolean> {
  // Transactional emails are always sent
  const transactionalTypes: EmailType[] = ["welcome", "bet_confirmation", "redemption_receipt"];
  if (transactionalTypes.includes(emailType)) {
    return true;
  }
  
  const { data: prefs } = await supabase
    .from("email_preferences")
    .select("notifications, marketing")
    .eq("user_id", userId)
    .single();
  
  if (!prefs) {
    return true;
  }
  
  // bet_result respects notifications preference
  if (emailType === "bet_result") {
    return (prefs as any).notifications;
  }
  
  return true;
}

async function logEmail(
  supabase: any,
  userId: string | undefined,
  emailType: EmailType,
  recipient: string,
  subject: string,
  status: "sent" | "failed" | "skipped",
  resendId?: string,
  errorMessage?: string
) {
  try {
    await supabase.from("email_logs").insert({
      user_id: userId || null,
      email_type: emailType,
      recipient,
      subject,
      status,
      resend_id: resendId || null,
      error_message: errorMessage || null,
      metadata: {
        timestamp: new Date().toISOString(),
      }
    });
  } catch (logError) {
    console.error("Failed to log email:", logError);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate environment variables first
    const { fromEmail, appUrl, resendApiKey } = getRequiredEnvVars();
    
    const resend = new Resend(resendApiKey);
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { type, to, userId, data }: EmailRequest = await req.json();

    console.log(`[send-email] Processing ${type} email to ${to}`);

    // Check user preferences if userId provided
    if (userId) {
      const shouldSend = await checkEmailPreferences(supabase, userId, type);
      if (!shouldSend) {
        console.log(`[send-email] Skipped ${type} for ${to} due to user preferences`);
        await logEmail(supabase, userId, type, to, "N/A", "skipped");
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "User preferences" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const { html, subject } = getEmailContent(type, data, appUrl);

    console.log(`[send-email] Sending ${type} email from ${fromEmail} to ${to}`);
    
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html,
    });

    if (emailError) {
      console.error(`[send-email] FAILED: ${type} to ${to}:`, emailError);
      await logEmail(supabase, userId, type, to, subject, "failed", undefined, emailError.message);
      throw new Error(emailError.message);
    }

    console.log(`[send-email] SUCCESS: ${type} to ${to}, resend_id=${emailResult?.id}`);
    await logEmail(supabase, userId, type, to, subject, "sent", emailResult?.id);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[send-email] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
