import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_predictions",
  title: "List my predictions",
  description:
    "List the signed-in user's predictions with stake, potential payout, market type and settlement status.",
  inputSchema: {
    status: z.enum(["PENDING", "WON", "LOST", "VOID"]).optional().describe("Filter by prediction status."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum number of predictions to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("predictions")
      .select(
        "id, tournament_name, athlete_name, discipline, category, market_type, staked_tokens, potential_payout, payout_tokens, status, created_at, settled_at"
      )
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { predictions: data ?? [] },
    };
  },
});