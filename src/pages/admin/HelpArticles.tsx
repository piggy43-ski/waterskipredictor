import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";

const SECTIONS = [
  "Predictions & Rules",
  "Tokens & Limits",
  "Rewards & Redemption",
  "Results & Finalization",
  "Troubleshooting",
];

interface HelpArticle {
  id: string;
  section: string;
  title: string;
  body: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ArticleFormData {
  section: string;
  title: string;
  body: string;
  sort_order: number;
}

const AdminHelpArticles = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<HelpArticle | null>(null);
  const [formData, setFormData] = useState<ArticleFormData>({
    section: SECTIONS[0],
    title: "",
    body: "",
    sort_order: 0,
  });

  const { data: articles, isLoading } = useQuery({
    queryKey: ["admin-help-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("*")
        .order("section")
        .order("sort_order");
      
      if (error) throw error;
      return data as HelpArticle[];
    },
  });

  const { data: feedbackStats } = useQuery({
    queryKey: ["help-feedback-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_feedback")
        .select("article_id, helpful");
      
      if (error) throw error;
      
      const stats: Record<string, { helpful: number; notHelpful: number }> = {};
      for (const fb of data) {
        if (!stats[fb.article_id]) {
          stats[fb.article_id] = { helpful: 0, notHelpful: 0 };
        }
        if (fb.helpful) {
          stats[fb.article_id].helpful++;
        } else {
          stats[fb.article_id].notHelpful++;
        }
      }
      return stats;
    },
  });

  const createArticle = useMutation({
    mutationFn: async (data: ArticleFormData) => {
      const { data: newArticle, error } = await supabase
        .from("help_articles")
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_type: "admin",
        actor_id: user?.id,
        action_type: "HELP_ARTICLE_CREATED",
        entity_type: "help_article",
        entity_id: newArticle.id,
        before_state: null,
        after_state: data as any,
      });

      return newArticle;
    },
    onSuccess: () => {
      toast.success("Article created");
      queryClient.invalidateQueries({ queryKey: ["admin-help-articles"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error("Failed to create article");
    },
  });

  const updateArticle = useMutation({
    mutationFn: async ({ id, data, beforeState }: { id: string; data: ArticleFormData; beforeState: HelpArticle }) => {
      const { error } = await supabase
        .from("help_articles")
        .update(data)
        .eq("id", id);
      
      if (error) throw error;

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_type: "admin",
        actor_id: user?.id,
        action_type: "HELP_ARTICLE_UPDATED",
        entity_type: "help_article",
        entity_id: id,
        before_state: beforeState as any,
        after_state: { ...beforeState, ...data } as any,
      });
    },
    onSuccess: () => {
      toast.success("Article updated");
      queryClient.invalidateQueries({ queryKey: ["admin-help-articles"] });
      setDialogOpen(false);
      setEditingArticle(null);
      resetForm();
    },
    onError: () => {
      toast.error("Failed to update article");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ article, newStatus }: { article: HelpArticle; newStatus: boolean }) => {
      const { error } = await supabase
        .from("help_articles")
        .update({ is_active: newStatus })
        .eq("id", article.id);
      
      if (error) throw error;

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_type: "admin",
        actor_id: user?.id,
        action_type: "HELP_ARTICLE_TOGGLED",
        entity_type: "help_article",
        entity_id: article.id,
        before_state: { is_active: !newStatus },
        after_state: { is_active: newStatus },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-help-articles"] });
      toast.success("Article visibility updated");
    },
    onError: () => {
      toast.error("Failed to update article");
    },
  });

  const resetForm = () => {
    setFormData({
      section: SECTIONS[0],
      title: "",
      body: "",
      sort_order: 0,
    });
  };

  const openCreateDialog = () => {
    setEditingArticle(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (article: HelpArticle) => {
    setEditingArticle(article);
    setFormData({
      section: article.section,
      title: article.title,
      body: article.body,
      sort_order: article.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.body.trim()) {
      toast.error("Title and body are required");
      return;
    }

    if (editingArticle) {
      updateArticle.mutate({
        id: editingArticle.id,
        data: formData,
        beforeState: editingArticle,
      });
    } else {
      createArticle.mutate(formData);
    }
  };

  const groupedArticles = articles?.reduce((acc, article) => {
    if (!acc[article.section]) {
      acc[article.section] = [];
    }
    acc[article.section].push(article);
    return acc;
  }, {} as Record<string, HelpArticle[]>);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Help Articles</h1>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Add Article
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading articles...
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {SECTIONS.map((section) => {
              const sectionArticles = groupedArticles?.[section] || [];
              return (
                <Card key={section}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{section}</span>
                      <Badge variant="outline">{sectionArticles.length} articles</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sectionArticles.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        No articles in this section
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead className="w-20">Order</TableHead>
                            <TableHead className="w-24">Feedback</TableHead>
                            <TableHead className="w-24">Active</TableHead>
                            <TableHead className="w-20">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sectionArticles.map((article) => {
                            const stats = feedbackStats?.[article.id];
                            return (
                              <TableRow key={article.id}>
                                <TableCell className="font-medium">
                                  {article.title}
                                </TableCell>
                                <TableCell>{article.sort_order}</TableCell>
                                <TableCell>
                                  {stats ? (
                                    <div className="flex items-center gap-2 text-sm">
                                      <span className="flex items-center gap-1 text-green-600">
                                        <ThumbsUp className="w-3 h-3" />
                                        {stats.helpful}
                                      </span>
                                      <span className="flex items-center gap-1 text-red-600">
                                        <ThumbsDown className="w-3 h-3" />
                                        {stats.notHelpful}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Switch
                                    checked={article.is_active}
                                    onCheckedChange={(checked) =>
                                      toggleActive.mutate({
                                        article,
                                        newStatus: checked,
                                      })
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditDialog(article)}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingArticle ? "Edit Article" : "Create Article"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Section</label>
                  <Select
                    value={formData.section}
                    onValueChange={(value) =>
                      setFormData({ ...formData, section: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTIONS.map((section) => (
                        <SelectItem key={section} value={section}>
                          {section}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Sort Order</label>
                  <Input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sort_order: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="Article title"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Body (Markdown supported)
                </label>
                <Textarea
                  value={formData.body}
                  onChange={(e) =>
                    setFormData({ ...formData, body: e.target.value })
                  }
                  placeholder="Article content..."
                  rows={12}
                />
                <p className="text-xs text-muted-foreground">
                  Supports: **bold**, *italic*, `code`, - lists, # headers
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createArticle.isPending || updateArticle.isPending}
              >
                {editingArticle ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminHelpArticles;
