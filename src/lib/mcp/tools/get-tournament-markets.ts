import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_tournament_markets",
  title: "Get tournament markets",
  description:
    "Get the published prediction markets for a tournament, including each selection (athlete) and its current multiplier.",
  inputSchema: {
    tournament_id: z.string().uuid().describe("The tournament UUID from list_tournaments."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tournament_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data: markets, error } = await supabase
      .from("markets")
      .select("id, name, market_type, discipline, category, is_published")
      .eq("tournament_id", tournament_id)
      .eq("is_published", true);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const ids = (markets ?? []).map((m) => m.id);
    let selections: unknown[] = [];
    if (ids.length > 0) {
      const { data: sel, error: selError } = await supabase
        .from("selections")
        .select("id, market_id, description, decimal_odds, result, athletes(name, country)")
        .in("market_id", ids);
      if (selError) return { content: [{ type: "text", text: selError.message }], isError: true };
      selections = sel ?? [];
    }

    const result = (markets ?? []).map((m) => ({
      ...m,
      selections: (selections as Array<{ market_id: string }>).filter((s) => s.market_id === m.id),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: { markets: result },
    };
  },
});