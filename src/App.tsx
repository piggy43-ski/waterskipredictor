import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Index from "./pages/Index";
import Tournaments from "./pages/Tournaments";
import TournamentDetail from "./pages/TournamentDetail";
import Wallet from "./pages/Wallet";
import Rewards from "./pages/Rewards";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Predictions from "./pages/Predictions";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminTournaments from "./pages/admin/Tournaments";
import AdminAthletes from "./pages/admin/Athletes";
import AdminAthleteDetail from "./pages/admin/AthleteDetail";
import AdminRankingsSync from "./pages/admin/RankingsSync";
import AdminRankingsImport from "./pages/admin/RankingsImport";
import AdminResults from "./pages/admin/Results";
import AdminMarkets from "./pages/admin/Markets";
import AdminSelections from "./pages/admin/Selections";
import AdminRewards from "./pages/admin/Rewards";
import AdminSettlement from "./pages/admin/Settlement";
import AthleteProfile from "./pages/AthleteProfile";

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
            <Route path="/profile" element={<Profile />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/:id" element={<TournamentDetail />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/athletes/:id" element={<AthleteProfile />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/athletes" element={<AdminAthletes />} />
            <Route path="/admin/athletes/:id" element={<AdminAthleteDetail />} />
            <Route path="/admin/rankings-sync" element={<AdminRankingsSync />} />
            <Route path="/admin/rankings-import" element={<AdminRankingsImport />} />
            <Route path="/admin/results" element={<AdminResults />} />
            <Route path="/admin/tournaments" element={<AdminTournaments />} />
            <Route path="/admin/markets" element={<AdminMarkets />} />
            <Route path="/admin/selections" element={<AdminSelections />} />
            <Route path="/admin/rewards" element={<AdminRewards />} />
            <Route path="/admin/settlement" element={<AdminSettlement />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
