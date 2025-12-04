import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/Index";
import Tournaments from "./pages/Tournaments";
import TournamentDetail from "./pages/TournamentDetailClean";
import Wallet from "./pages/Wallet";
import Rewards from "./pages/Rewards";
import Transactions from "./pages/Transactions";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import UpdatePassword from "./pages/UpdatePassword";
import Profile from "./pages/Profile";
import Predictions from "./pages/Predictions";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminTournaments from "./pages/admin/Tournaments";
import AdminAthletes from "./pages/admin/Athletes";
import AdminAthleteDetail from "./pages/admin/AthleteDetail";
import AdminRankingsSync from "./pages/admin/RankingsSync";
import AdminRankingsImport from "./pages/admin/RankingsImport";
import AdminMarkets from "./pages/admin/Markets";
import AdminSelections from "./pages/admin/Selections";
import AdminRewards from "./pages/admin/Rewards";
import AdminTournamentSettlement from "./pages/admin/TournamentSettlement";
import AdminTournamentEntries from "./pages/admin/TournamentEntries";
import AdminDataIntegrity from "./pages/admin/DataIntegrity";
import AdminHouseLedger from "./pages/admin/HouseLedger";
import AdminUsers from "./pages/admin/Users";
import AthleteProfile from "./pages/AthleteProfile";
import Fantasy from "./pages/Fantasy";
import FantasyPotDetail from "./pages/FantasyPotDetail";
import FantasyTeamView from "./pages/FantasyTeamView";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/:id" element={<TournamentDetail />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/athletes/:id" element={<AthleteProfile />} />
            <Route path="/fantasy" element={<Fantasy />} />
            <Route path="/fantasy/:potId" element={<FantasyPotDetail />} />
            <Route path="/fantasy/:potId/team/:entryId" element={<FantasyTeamView />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/athletes" element={<AdminAthletes />} />
            <Route path="/admin/athletes/:id" element={<AdminAthleteDetail />} />
            <Route path="/admin/rankings-sync" element={<AdminRankingsSync />} />
            <Route path="/admin/rankings-import" element={<AdminRankingsImport />} />
            <Route path="/admin/tournaments" element={<AdminTournaments />} />
            <Route path="/admin/markets" element={<AdminMarkets />} />
            <Route path="/admin/selections" element={<AdminSelections />} />
            <Route path="/admin/rewards" element={<AdminRewards />} />
            <Route path="/admin/tournament-settlement" element={<AdminTournamentSettlement />} />
            <Route path="/admin/tournament-entries" element={<AdminTournamentEntries />} />
            <Route path="/admin/data-integrity" element={<AdminDataIntegrity />} />
            <Route path="/admin/house-ledger" element={<AdminHouseLedger />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
