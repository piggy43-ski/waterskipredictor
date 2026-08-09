import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_leaderboard",
  title: "Get leaderboard",
  description:
    "Get the top players on the season leaderboard, plus the signed-in user's own rank and net token P&L.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many top players to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const [top, mine] = await Promise.all([
      supabase.rpc("get_leaderboard_top", { p_limit: limit ?? 10 }),
      supabase.rpc("get_user_leaderboard_position", { p_user_id: ctx.getUserId() }),
    ]);
    if (top.error) return { content: [{ type: "text", text: top.error.message }], isError: true };
    const myPosition = Array.isArray(mine.data) ? mine.data[0] ?? null : mine.data ?? null;
    const payload = { top: top.data ?? [], my_position: myPosition };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});