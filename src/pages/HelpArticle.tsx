import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ThumbsUp, ThumbsDown, CheckCircle, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";

interface HelpArticle {
  id: string;
  section: string;
  title: string;
  body: string;
}

// Secure markdown renderer with XSS sanitization
const renderMarkdown = (text: string): string => {
  // First escape any raw HTML in the input to prevent XSS
  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Escape all HTML first
  let escaped = escapeHtml(text);
  
  // Then apply markdown transformations (safe because we escaped HTML)
  let html = escaped
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`(.*?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-sm">$1</code>')
    // Unordered lists
    .replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>')
    // Emojis with spacing
    .replace(/(❌|✅|📧|🎯|⚽|🎁|💰|🏆)/g, '<span class="mr-1">$1</span>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p class="mb-4">')
    // Single newlines
    .replace(/\n/g, '<br/>');

  const rawHtml = `<p class="mb-4">${html}</p>`;
  
  // Sanitize the output with DOMPurify as defense in depth
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'code', 'span'],
    ALLOWED_ATTR: ['class']
  });
};

const HelpArticle = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [selectedHelpful, setSelectedHelpful] = useState<boolean | null>(null);

  const { data: article, isLoading } = useQuery({
    queryKey: ["help-article", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id, section, title, body")
        .eq("id", id)
        .eq("is_active", true)
        .single();
      
      if (error) throw error;
      return data as HelpArticle;
    },
    enabled: !!id,
  });

  const { data: relatedArticles } = useQuery({
    queryKey: ["related-articles", article?.section],
    queryFn: async () => {
      if (!article?.section) return [];
      
      const { data, error } = await supabase
        .from("help_articles")
        .select("id, title")
        .eq("section", article.section)
        .eq("is_active", true)
        .neq("id", id)
        .order("sort_order")
        .limit(3);
      
      if (error) throw error;
      return data;
    },
    enabled: !!article?.section,
  });

  const submitFeedback = useMutation({
    mutationFn: async ({ helpful, text }: { helpful: boolean; text?: string }) => {
      const { error } = await supabase.from("help_feedback").insert({
        article_id: id,
        user_id: user?.id || null,
        helpful,
        feedback_text: text || null,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      setFeedbackSubmitted(true);
      setShowFeedbackForm(false);
      toast.success("Thank you for your feedback!");
      queryClient.invalidateQueries({ queryKey: ["help-feedback"] });
    },
    onError: () => {
      toast.error("Failed to submit feedback");
    },
  });

  const handleFeedbackClick = (helpful: boolean) => {
    setSelectedHelpful(helpful);
    if (helpful) {
      submitFeedback.mutate({ helpful: true });
    } else {
      setShowFeedbackForm(true);
    }
  };

  const handleSubmitNegativeFeedback = () => {
    submitFeedback.mutate({ helpful: false, text: feedbackText });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="container max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Skeleton className="w-10 h-10 rounded" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-4 w-32 mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="container max-w-2xl mx-auto px-4 py-6">
          <Button variant="ghost" onClick={() => navigate("/help")} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Help Center
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Article not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <SEO title={article.title} description={`${article.section} — read more about ${article.title} on WaterSki Predictor's Help Center.`} path={`/help/${article.id}`} type="article" />
      <div className="container max-w-2xl mx-auto px-4 py-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/help")}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Help Center
        </Button>

        <div className="mb-2">
          <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
            {article.section}
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-6">{article.title}</h1>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div
              className="prose prose-sm max-w-none text-foreground"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
            />
          </CardContent>
        </Card>

        {/* Feedback section */}
        <Card className="mb-8">
          <CardContent className="py-6">
            {feedbackSubmitted ? (
              <div className="flex items-center justify-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span>Thank you for your feedback!</span>
              </div>
            ) : showFeedbackForm ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Sorry this wasn't helpful. How can we improve?
                </p>
                <Textarea
                  placeholder="Tell us what was missing or unclear..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmitNegativeFeedback}
                    disabled={submitFeedback.isPending}
                  >
                    Submit Feedback
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowFeedbackForm(false);
                      setSelectedHelpful(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Was this article helpful?
                </p>
                <div className="flex justify-center gap-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => handleFeedbackClick(true)}
                    disabled={submitFeedback.isPending}
                    className="gap-2"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Yes
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => handleFeedbackClick(false)}
                    disabled={submitFeedback.isPending}
                    className="gap-2"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    No
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Related articles */}
        {relatedArticles && relatedArticles.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Related Articles</h2>
            <div className="space-y-2">
              {relatedArticles.map((related) => (
                <button
                  key={related.id}
                  onClick={() => navigate(`/help/${related.id}`)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <span className="text-foreground">{related.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HelpArticle;
