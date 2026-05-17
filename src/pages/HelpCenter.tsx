import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, Search, BookOpen, Coins, Gift, Trophy, Wrench, HelpCircle, User, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrustDisclaimer } from "@/components/TrustDisclaimer";

const sectionIcons: Record<string, React.ReactNode> = {
  "Predictions & Rules": <BookOpen className="w-5 h-5" />,
  "Tokens & Limits": <Coins className="w-5 h-5" />,
  "Rewards & Redemption": <Gift className="w-5 h-5" />,
  "Results & Finalization": <Trophy className="w-5 h-5" />,
  "Account & Profile": <User className="w-5 h-5" />,
  "Troubleshooting": <Wrench className="w-5 h-5" />,
};

const sectionOrder = [
  "Predictions & Rules",
  "Tokens & Limits",
  "Rewards & Redemption",
  "Results & Finalization",
  "Account & Profile",
  "Troubleshooting",
];

interface HelpArticle {
  id: string;
  section: string;
  title: string;
  body: string;
  sort_order: number;
}

const HelpCenter = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  
  const initialSection = searchParams.get("section") || "";
  const [openSections, setOpenSections] = useState<string[]>(
    initialSection ? [initialSection] : []
  );

  const { data: articles, isLoading } = useQuery({
    queryKey: ["help-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id, section, title, body, sort_order")
        .eq("is_active", true)
        .order("section")
        .order("sort_order");
      
      if (error) throw error;
      return data as HelpArticle[];
    },
  });

  const filteredArticles = useMemo(() => {
    if (!articles) return [];
    if (!searchQuery.trim()) return articles;
    
    const query = searchQuery.toLowerCase();
    return articles.filter(
      (article) =>
        article.title.toLowerCase().includes(query) ||
        article.body.toLowerCase().includes(query)
    );
  }, [articles, searchQuery]);

  const groupedArticles = useMemo(() => {
    const groups: Record<string, HelpArticle[]> = {};
    
    for (const article of filteredArticles) {
      if (!groups[article.section]) {
        groups[article.section] = [];
      }
      groups[article.section].push(article);
    }
    
    return groups;
  }, [filteredArticles]);

  const sortedSections = useMemo(() => {
    return sectionOrder.filter((section) => groupedArticles[section]);
  }, [groupedArticles]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <SEO title="Help Center" description="Find answers to questions about predictions, tokens, rewards, and how WaterSki Predictor works." path="/help" />
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-primary" />
                <h1 className="text-xl font-bold">Help Center</h1>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="shrink-0"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search help articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredArticles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No articles found matching your search."
                  : "No help articles available."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={setOpenSections}
            className="space-y-4"
          >
            {sortedSections.map((section) => (
              <AccordionItem
                key={section}
                value={section}
                className="border rounded-lg bg-card overflow-hidden"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {sectionIcons[section] || <HelpCircle className="w-5 h-5" />}
                    </div>
                    <span className="font-semibold">{section}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {groupedArticles[section].length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2 pt-2">
                    {groupedArticles[section].map((article) => (
                      <button
                        key={article.id}
                        onClick={() => navigate(`/help/${article.id}`)}
                        className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                      >
                        <h3 className="font-medium text-foreground">
                          {article.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {article.body.replace(/[#*`\[\]]/g, "").slice(0, 100)}...
                        </p>
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Trust Disclaimer */}
        <TrustDisclaimer className="mt-8" />
      </div>
    </div>
  );
};

export default HelpCenter;
