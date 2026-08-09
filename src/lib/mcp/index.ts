import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTournaments from "./tools/list-tournaments";
import getTournamentMarkets from "./tools/get-tournament-markets";
import getMyWallet from "./tools/get-my-wallet";
import listMyPredictions from "./tools/list-my-predictions";
import getLeaderboard from "./tools/get-leaderboard";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "waterski-predictions",
  title: "Waterski Predictions",
  version: "0.1.0",
  instructions:
    "Tools for Waterski Predictions. Browse IWWF tournaments and their published prediction markets, and read the signed-in user's token wallet, predictions and leaderboard position. All tools are read-only and act as the connected user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTournaments, getTournamentMarkets, getMyWallet, listMyPredictions, getLeaderboard],
});