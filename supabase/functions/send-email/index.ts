import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

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

// Generate HTML templates directly (avoiding npm import issues)
function generateWelcomeEmail(data: { username: string; bonusTokens: number; appUrl: string }): string {
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
      Welcome aboard, ${data.username}!
    </h1>
    
    <p style="color: #d1d5db; font-size: 16px; line-height: 26px; margin: 16px 0;">
      Your account is now active and loaded with <strong>${data.bonusTokens.toLocaleString()} bonus tokens</strong> to get you started.
    </p>
    
    <p style="color: #d1d5db; font-size: 16px; line-height: 26px; margin: 16px 0;">
      Start making predictions on your favorite water ski athletes, compete in fantasy leagues, and redeem your winnings for exclusive rewards!
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.appUrl}" style="background-color: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 14px 28px; display: inline-block;">
        Start Predicting
      </a>
    </div>
    
    <p style="color: #d1d5db; font-size: 16px; margin: 16px 0;"><strong>Quick tips to get started:</strong></p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Browse upcoming tournaments and make your predictions</p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Join fantasy pots to compete with other fans</p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Check out athlete profiles and stats</p>
    <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 4px 8px;">• Redeem tokens for coaching sessions and gear</p>
    
    <div style="color: #6b7280; font-size: 14px; line-height: 24px; margin-top: 40px; text-align: center; border-top: 1px solid #374151; padding-top: 24px;">
      Happy predicting!<br>
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

function getEmailContent(type: EmailType, data: Record<string, any>): { html: string; subject: string } {
  const appUrl = Deno.env.get("APP_URL") || "https://waterski-predictor.lovable.app";
  
  switch (type) {
    case "welcome":
      return {
        html: generateWelcomeEmail({
          username: data.username || "Champion",
          bonusTokens: data.bonusTokens || 10000,
          appUrl,
        }),
        subject: "Welcome to WaterSki Predictor! 🎿",
      };
    
    case "bet_confirmation":
      return {
        html: generateBetConfirmationEmail({
          username: data.username || "Champion",
          athleteName: data.athleteName,
          tournamentName: data.tournamentName,
          discipline: data.discipline,
          marketType: data.marketType,
          stakedTokens: data.stakedTokens,
          potentialPayout: data.potentialPayout,
          odds: data.odds,
          appUrl,
        }),
        subject: `Prediction Confirmed: ${data.athleteName}`,
      };
    
    case "bet_result": {
      const resultEmoji = data.result === "won" ? "🎉" : data.result === "void" ? "↩️" : "";
      const subjectPrefix = data.result === "won" ? "You Won!" : data.result === "void" ? "Prediction Voided" : "Prediction Result";
      return {
        html: generateBetResultEmail({
          username: data.username || "Champion",
          athleteName: data.athleteName,
          tournamentName: data.tournamentName,
          result: data.result,
          stakedTokens: data.stakedTokens,
          payoutTokens: data.payoutTokens,
          appUrl,
        }),
        subject: `${resultEmoji} ${subjectPrefix}: ${data.athleteName}`,
      };
    }
    
    case "redemption_receipt":
      return {
        html: generateRedemptionReceiptEmail({
          username: data.username || "Champion",
          rewardName: data.rewardName,
          rewardDescription: data.rewardDescription,
          tokensSpent: data.tokensSpent,
          partnerName: data.partnerName,
          redemptionId: data.redemptionId,
          appUrl,
        }),
        subject: `🎁 Reward Redeemed: ${data.rewardName}`,
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
  await supabase.from("email_logs").insert({
    user_id: userId || null,
    email_type: emailType,
    recipient,
    subject,
    status,
    resend_id: resendId || null,
    error_message: errorMessage || null,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { type, to, userId, data }: EmailRequest = await req.json();

    console.log(`Processing ${type} email for ${to}`);

    if (userId) {
      const shouldSend = await checkEmailPreferences(supabase, userId, type);
      if (!shouldSend) {
        console.log(`Email ${type} skipped due to user preferences`);
        await logEmail(supabase, userId, type, to, "N/A", "skipped");
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "User preferences" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const { html, subject } = getEmailContent(type, data);

    const fromEmail = Deno.env.get("FROM_EMAIL") || "WaterSki Predictor <onboarding@resend.dev>";
    
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject,
      html,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      await logEmail(supabase, userId, type, to, subject, "failed", undefined, emailError.message);
      throw new Error(emailError.message);
    }

    console.log("Email sent successfully:", emailResult);
    await logEmail(supabase, userId, type, to, subject, "sent", emailResult?.id);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
