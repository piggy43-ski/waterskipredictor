import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { TutorialProvider, TutorialOverlay, TutorialBubble } from "./components/tutorial";
import { ProtectedRoute } from "./components/ProtectedRoute";
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
import FantasyTeamEdit from "./pages/FantasyTeamEdit";
import FantasySeasonView from "./pages/FantasySeasonView";
import AdminFantasyPots from "./pages/admin/FantasyPots";
import AdminSettlementTest from "./pages/admin/SettlementTest";
import AdminLiabilities from "./pages/admin/Liabilities";
import AdminMarketResults from "./pages/admin/MarketResults";
import AdminMarketOddsReview from "./pages/admin/MarketOddsReview";
import AdminContestEntries from "./pages/admin/ContestEntries";
import AdminTournamentSimulator from "./pages/admin/TournamentSimulator";
import AdminMarketLiability from "./pages/admin/MarketLiability";
import AdminAuditLogs from "./pages/admin/AuditLogs";
import AdminRewardLiabilityDashboard from "./pages/admin/RewardLiabilityDashboard";
import AdminRiskDashboard from "./pages/admin/RiskDashboard";
import AdminProbabilityOverrides from "./pages/admin/ProbabilityOverrides";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCanceled from "./pages/PaymentCanceled";
import HelpCenter from "./pages/HelpCenter";
import HelpArticle from "./pages/HelpArticle";
import AdminHelpArticles from "./pages/admin/HelpArticles";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TutorialProvider>
            <TutorialOverlay />
            <TutorialBubble />
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/update-password" element={<UpdatePassword />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              
              {/* Protected routes */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
              <Route path="/tournaments" element={<ProtectedRoute><Tournaments /></ProtectedRoute>} />
              <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetail /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
              <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
              <Route path="/payment-canceled" element={<ProtectedRoute><PaymentCanceled /></ProtectedRoute>} />
              <Route path="/predictions" element={<ProtectedRoute><Predictions /></ProtectedRoute>} />
              <Route path="/rewards" element={<ProtectedRoute><Rewards /></ProtectedRoute>} />
              <Route path="/athletes/:id" element={<ProtectedRoute><AthleteProfile /></ProtectedRoute>} />
              <Route path="/fantasy" element={<ProtectedRoute><Fantasy /></ProtectedRoute>} />
              <Route path="/fantasy/:potId" element={<ProtectedRoute><FantasyPotDetail /></ProtectedRoute>} />
              <Route path="/fantasy/:potId/team/:entryId" element={<ProtectedRoute><FantasyTeamView /></ProtectedRoute>} />
              <Route path="/fantasy/:potId/team/:entryId/edit" element={<ProtectedRoute><FantasyTeamEdit /></ProtectedRoute>} />
              <Route path="/fantasy/season/:potId/team/:entryId" element={<ProtectedRoute><FantasySeasonView /></ProtectedRoute>} />
              <Route path="/help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
              <Route path="/help/:id" element={<ProtectedRoute><HelpArticle /></ProtectedRoute>} />
              
              {/* Admin routes */}
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/risk-dashboard" element={<ProtectedRoute><AdminRiskDashboard /></ProtectedRoute>} />
              <Route path="/admin/help-articles" element={<ProtectedRoute><AdminHelpArticles /></ProtectedRoute>} />
              <Route path="/admin/fantasy-pots" element={<ProtectedRoute><AdminFantasyPots /></ProtectedRoute>} />
              <Route path="/admin/athletes" element={<ProtectedRoute><AdminAthletes /></ProtectedRoute>} />
              <Route path="/admin/athletes/:id" element={<ProtectedRoute><AdminAthleteDetail /></ProtectedRoute>} />
              <Route path="/admin/rankings-sync" element={<ProtectedRoute><AdminRankingsSync /></ProtectedRoute>} />
              <Route path="/admin/rankings-import" element={<ProtectedRoute><AdminRankingsImport /></ProtectedRoute>} />
              <Route path="/admin/tournaments" element={<ProtectedRoute><AdminTournaments /></ProtectedRoute>} />
              <Route path="/admin/markets" element={<ProtectedRoute><AdminMarkets /></ProtectedRoute>} />
              <Route path="/admin/selections" element={<ProtectedRoute><AdminSelections /></ProtectedRoute>} />
              <Route path="/admin/rewards" element={<ProtectedRoute><AdminRewards /></ProtectedRoute>} />
              <Route path="/admin/tournament-settlement" element={<ProtectedRoute><AdminTournamentSettlement /></ProtectedRoute>} />
              <Route path="/admin/tournament-entries" element={<ProtectedRoute><AdminTournamentEntries /></ProtectedRoute>} />
              <Route path="/admin/data-integrity" element={<ProtectedRoute><AdminDataIntegrity /></ProtectedRoute>} />
              <Route path="/admin/house-ledger" element={<ProtectedRoute><AdminHouseLedger /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/settlement-test" element={<ProtectedRoute><AdminSettlementTest /></ProtectedRoute>} />
              <Route path="/admin/liabilities" element={<ProtectedRoute><AdminLiabilities /></ProtectedRoute>} />
              <Route path="/admin/market-results" element={<ProtectedRoute><AdminMarketResults /></ProtectedRoute>} />
              <Route path="/admin/odds-review" element={<ProtectedRoute><AdminMarketOddsReview /></ProtectedRoute>} />
              <Route path="/admin/contest-entries" element={<ProtectedRoute><AdminContestEntries /></ProtectedRoute>} />
              <Route path="/admin/tournament-simulator" element={<ProtectedRoute><AdminTournamentSimulator /></ProtectedRoute>} />
              <Route path="/admin/market-liability" element={<ProtectedRoute><AdminMarketLiability /></ProtectedRoute>} />
              <Route path="/admin/audit-logs" element={<ProtectedRoute><AdminAuditLogs /></ProtectedRoute>} />
              <Route path="/admin/reward-dashboard" element={<ProtectedRoute><AdminRewardLiabilityDashboard /></ProtectedRoute>} />
              <Route path="/admin/probability-overrides" element={<ProtectedRoute><AdminProbabilityOverrides /></ProtectedRoute>} />
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TutorialProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
