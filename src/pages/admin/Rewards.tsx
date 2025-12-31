import { useState, useRef, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Upload, X, Package, User } from 'lucide-react';

type Reward = {
  id: string;
  name: string;
  description: string;
  partner: string;
  category: string;
  required_tokens: number;
  available: boolean;
  image_url: string | null;
  max_total: number | null;
  max_per_user: number | null;
  fulfillment_type: string | null;
  usd_cost: number | null;
};

export default function AdminRewards() {
  const [open, setOpen] = useState(false);
  const [limitType, setLimitType] = useState('unlimited');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rewards, isLoading } = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .order('required_tokens');
      
      if (error) throw error;
      return data as Reward[];
    },
  });

  // Fetch redemption counts for total limits
  const { data: redemptionCounts } = useQuery({
    queryKey: ['redemption-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('redemptions')
        .select('reward_id');
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(r => {
        counts[r.reward_id] = (counts[r.reward_id] || 0) + 1;
      });
      return counts;
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetForm = () => {
    setLimitType('unlimited');
    clearImage();
  };

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      let imageUrl: string | null = null;

      // Upload image if provided
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('reward-images')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('reward-images')
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      }

      // Parse limit values based on limit type
      const limitTypeValue = formData.get('limit_type') as string;
      let maxTotal: number | null = null;
      let maxPerUser: number | null = null;

      if (limitTypeValue === 'total' || limitTypeValue === 'both') {
        const totalValue = formData.get('max_total') as string;
        maxTotal = totalValue ? parseInt(totalValue) : null;
      }

      if (limitTypeValue === 'per_user' || limitTypeValue === 'both') {
        const perUserValue = formData.get('max_per_user') as string;
        maxPerUser = perUserValue ? parseInt(perUserValue) : null;
      }

      const fulfillmentType = formData.get('fulfillment_type') as string;
      const usdCostValue = formData.get('usd_cost') as string;

      const reward = {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        partner: formData.get('partner') as string,
        category: formData.get('category') as string,
        required_tokens: parseInt(formData.get('required_tokens') as string),
        available: true,
        image_url: imageUrl,
        max_total: maxTotal,
        max_per_user: maxPerUser,
        fulfillment_type: fulfillmentType || 'digital',
        usd_cost: usdCostValue ? parseFloat(usdCostValue) : null,
      };

      const { error } = await supabase.from('rewards').insert(reward);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['redemption-counts'] });
      setOpen(false);
      resetForm();
      toast({ title: 'Reward created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating reward', description: error.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const { error } = await supabase
        .from('rewards')
        .update({ available })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
      toast({ title: 'Reward updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating reward', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rewards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
      toast({ title: 'Reward deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting reward', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate(formData);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Rewards</h2>
            <p className="text-muted-foreground mt-1">Manage reward catalog</p>
          </div>
          
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Reward
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Reward</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Image Upload */}
                <div>
                  <Label>Reward Logo/Image</Label>
                  <div className="mt-2">
                    {imagePreview ? (
                      <div className="relative w-32 h-32">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          className="w-full h-full object-cover rounded-lg border border-border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 w-6 h-6"
                          onClick={clearImage}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div 
                        className="w-32 h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                        <span className="text-xs text-muted-foreground">Upload Image</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="name">Reward Name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" required />
                </div>
                <div>
                  <Label htmlFor="partner">Partner</Label>
                  <Input id="partner" name="partner" required />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merchandise">Merchandise</SelectItem>
                      <SelectItem value="experience">Experience</SelectItem>
                      <SelectItem value="discount">Discount</SelectItem>
                      <SelectItem value="vip">VIP Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Fulfillment Type */}
                <div>
                  <Label>Fulfillment Type</Label>
                  <Select name="fulfillment_type" defaultValue="digital">
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="digital">Digital</SelectItem>
                      <SelectItem value="physical">Physical (shipped)</SelectItem>
                      <SelectItem value="coaching">Coaching Session</SelectItem>
                      <SelectItem value="vip">VIP Experience</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    How this reward will be fulfilled
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="required_tokens">Required Tokens</Label>
                    <Input id="required_tokens" name="required_tokens" type="number" min="1" required />
                  </div>
                  <div>
                    <Label htmlFor="usd_cost">Est. USD Cost (optional)</Label>
                    <Input 
                      id="usd_cost" 
                      name="usd_cost" 
                      type="number" 
                      min="0" 
                      step="0.01" 
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  USD cost helps track house liability for fulfillment
                </p>

                {/* Limit Type Selection */}
                <div>
                  <Label>Availability Limits</Label>
                  <Select 
                    name="limit_type" 
                    value={limitType} 
                    onValueChange={setLimitType}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlimited">Unlimited</SelectItem>
                      <SelectItem value="total">Limited Total Quantity</SelectItem>
                      <SelectItem value="per_user">Limited Per User</SelectItem>
                      <SelectItem value="both">Both Limits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Conditional limit inputs */}
                {(limitType === 'total' || limitType === 'both') && (
                  <div>
                    <Label htmlFor="max_total">Total Quantity Available</Label>
                    <Input 
                      id="max_total" 
                      name="max_total" 
                      type="number" 
                      min="1" 
                      placeholder="e.g., 5 gloves total"
                      required 
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Total number of this reward that can be redeemed by all users
                    </p>
                  </div>
                )}

                {(limitType === 'per_user' || limitType === 'both') && (
                  <div>
                    <Label htmlFor="max_per_user">Limit Per User</Label>
                    <Input 
                      id="max_per_user" 
                      name="max_per_user" 
                      type="number" 
                      min="1" 
                      placeholder="e.g., 1 per user"
                      required 
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum times each user can redeem this reward
                    </p>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Reward'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Loading rewards...</p>
            </CardContent>
          </Card>
        ) : rewards && rewards.length > 0 ? (
          <div className="grid gap-4">
            {rewards.map((reward) => {
              const totalRedeemed = redemptionCounts?.[reward.id] || 0;
              const remainingTotal = reward.max_total ? reward.max_total - totalRedeemed : null;

              return (
                <Card key={reward.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      {/* Image */}
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {reward.image_url ? (
                          <img 
                            src={reward.image_url} 
                            alt={reward.name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <CardTitle>{reward.name}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {reward.partner} • {reward.category}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          {reward.description}
                        </p>
                        
                        {/* Limit badges */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          {reward.max_total && (
                            <Badge variant={remainingTotal === 0 ? "destructive" : "secondary"}>
                              <Package className="w-3 h-3 mr-1" />
                              {remainingTotal}/{reward.max_total} left
                            </Badge>
                          )}
                          {reward.max_per_user && (
                            <Badge variant="outline">
                              <User className="w-3 h-3 mr-1" />
                              {reward.max_per_user} per user
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteMutation.mutate(reward.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-1 bg-primary text-primary-foreground rounded text-sm font-medium">
                        {reward.required_tokens} tokens
                      </span>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`available-${reward.id}`} className="text-sm">Available</Label>
                        <Switch
                          id={`available-${reward.id}`}
                          checked={reward.available}
                          onCheckedChange={(checked) => 
                            toggleMutation.mutate({ id: reward.id, available: checked })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No rewards found. Create your first reward to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}