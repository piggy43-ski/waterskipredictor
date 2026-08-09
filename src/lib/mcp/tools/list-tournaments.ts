import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tournaments",
  title: "List tournaments",
  description:
    "List waterski tournaments with their dates, location, disciplines and status (upcoming, live, finished).",
  inputSchema: {
    status: z.enum(["upcoming", "live", "finished"]).optional().describe("Filter by tournament status."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of tournaments to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("tournaments")
      .select("id, name, location, status, disciplines, start_date, end_date, start_datetime, end_datetime, settled_at")
      .order("start_date", { ascending: false })
      .limit(limit ?? 20);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { tournaments: data ?? [] },
    };
  },
});