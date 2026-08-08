/**
 * THE VAULT — transactional email helper.
 * Uses the project's existing Resend setup. Respects public.email_preferences
 * when the user has a row (transactional = false means we stay quiet).
 */
import { Resend } from "https://esm.sh/resend@2.0.0";

export function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

const shell = (title: string, body: string) => `
<div style="background:#12100e;padding:32px 0;font-family:Georgia,serif;color:#efe7d9">
  <div style="max-width:560px;margin:0 auto;background:#1a1714;border:1px solid #3a332c;padding:28px">
    <p style="letter-spacing:.28em;font-size:10px;text-transform:uppercase;color:#c9a227;margin:0 0 18px">The Vault</p>
    <h1 style="font-size:22px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 16px">${esc(title)}</h1>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#d8cfc0">${body}</div>
    <p style="margin-top:22px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#d8cfc0">— The Vault, by Waterski Predictor</p>
    <p style="margin-top:26px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#8b8177">
      The Vault is a gear marketplace settled in US dollars. It is entirely separate from Waterski Predictor tokens —
      no tokens are used in any auction.
    </p>
  </div>
</div>`;

export async function sendVaultEmail(
  supabase: any,
  opts: { to?: string | null; userId?: string | null; subject: string; title: string; body: string; force?: boolean },
): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  // Sender is always "The Vault" — never a personal name, whatever FROM_EMAIL holds.
  const rawFrom = Deno.env.get("VAULT_FROM_EMAIL") || Deno.env.get("FROM_EMAIL") || "vault@waterskipredictor.com";
  const address = rawFrom.match(/<(.+)>/)?.[1] ?? rawFrom.trim();
  const from = `The Vault <${address}>`;
  const replyTo = Deno.env.get("VAULT_REPLY_TO") || "support@waterskipredictor.com";

  let to = opts.to ?? null;
  if (opts.userId) {
    if (!opts.force) {
      const { data: prefs } = await supabase
        .from("email_preferences").select("transactional").eq("user_id", opts.userId).maybeSingle();
      if (prefs && prefs.transactional === false) return false;
    }
    if (!to) {
      const { data: authUser } = await supabase.auth.admin.getUserById(opts.userId);
      to = authUser?.user?.email ?? null;
    }
  }
  if (!to) return false;

  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to: [to],
      reply_to: replyTo,
      subject: opts.subject,
      html: shell(opts.title, opts.body),
    });
    return true;
  } catch (e) {
    console.error("[VAULT-EMAIL] send failed", (e as Error).message);
    return false;
  }
}

export async function adminEmail(): Promise<string | null> {
  return Deno.env.get("ADMIN_EMAIL") || Deno.env.get("FROM_EMAIL")?.match(/<(.+)>/)?.[1] ||
    Deno.env.get("FROM_EMAIL") || null;
}