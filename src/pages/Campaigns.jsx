import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Megaphone, Pencil, Trash2, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";

const statusColors = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  paused: "bg-amber-500/10 text-amber-600 border-amber-200",
  completed: "bg-primary/10 text-primary border-primary/20",
};

function CampaignForm({ campaign, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: campaign?.name || "",
    description: campaign?.description || "",
    status: campaign?.status || "draft",
    start_date: campaign?.start_date || "",
    end_date: campaign?.end_date || "",
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
      <div className="space-y-2">
        <Label>Campaign Name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Summer Sale" required />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Campaign details" />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date</Label>
          <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>End Date</Label>
          <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : campaign ? "Update" : "Create"}</Button>
      </div>
    </form>
  );
}

export default function Campaigns() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => base44.entities.Campaign.list("-created_date", 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Campaign.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); setDialogOpen(false); toast.success("Campaign created"); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Campaign.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); setDialogOpen(false); setEditCampaign(null); toast.success("Campaign updated"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Campaign.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Campaign deleted"); },
  });

  const handleSave = (data) => {
    if (editCampaign) updateMutation.mutate({ id: editCampaign.id, data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize your affiliate marketing campaigns</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditCampaign(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> New Campaign</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editCampaign ? "Edit Campaign" : "New Campaign"}</DialogTitle>
            </DialogHeader>
            <CampaignForm
              campaign={editCampaign}
              onSave={handleSave}
              onCancel={() => { setDialogOpen(false); setEditCampaign(null); }}
              saving={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="p-12 text-center">
          <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground mt-4">No campaigns yet — create your first one</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold font-display text-lg">{campaign.name}</h3>
                    {campaign.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{campaign.description}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={statusColors[campaign.status] || ""}>{campaign.status || "draft"}</Badge>
                </div>
                {(campaign.start_date || campaign.end_date) && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    {campaign.start_date && format(new Date(campaign.start_date), "MMM d")}
                    {campaign.start_date && campaign.end_date && " → "}
                    {campaign.end_date && format(new Date(campaign.end_date), "MMM d, yyyy")}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-4 pt-3 border-t">
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setEditCampaign(campaign); setDialogOpen(true); }}>
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-destructive" onClick={() => deleteMutation.mutate(campaign.id)}>
                    <Trash2 className="w-3 h-3" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}