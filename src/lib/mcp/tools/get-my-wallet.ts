import { defineTool } from "@lovable.dev/mcp-js";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_wallet",
  title: "Get my token balance",
  description: "Get the signed-in user's token wallet balance (earned and purchased tokens).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("token_wallets")
      .select("earned_tokens, purchased_tokens, updated_at")
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "No wallet found for this account." }] };
    const wallet = {
      earned_tokens: data.earned_tokens,
      purchased_tokens: data.purchased_tokens,
      total_tokens: (data.earned_tokens ?? 0) + (data.purchased_tokens ?? 0),
      updated_at: data.updated_at,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(wallet, null, 2) }],
      structuredContent: { wallet },
    };
  },
});