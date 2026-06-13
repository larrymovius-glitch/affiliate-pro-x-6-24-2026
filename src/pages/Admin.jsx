import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, UserPlus, Trash2, Shield, ShieldOff, Mail,
  Star, RefreshCw, Settings, Crown, AlertCircle, CheckCircle
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const ROLE_COLORS = {
  admin: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  user: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export default function Admin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);

  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [showReviewerDialog, setShowReviewerDialog] = useState(false);
  const [editReviewer, setEditReviewer] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null);

  // Fetch all users
  const { data: users = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => base44.entities.User.list(),
  });

  // Fetch Google reviewers
  const { data: reviewers = [], isLoading: loadingReviewers, refetch: refetchReviewers } = useQuery({
    queryKey: ["admin-reviewers"],
    queryFn: () => base44.entities.GoogleReviewer.list(),
  });

  // Invite user
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteMsg(null);
    try {
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole);
      setInviteMsg({ type: "success", text: `Invitation sent to ${inviteEmail}` });
      setInviteEmail("");
      refetchUsers();
    } catch (e) {
      setInviteMsg({ type: "error", text: e.message || "Failed to invite user" });
    }
    setInviteLoading(false);
  };

  // Toggle admin role
  const toggleRoleMutation = useMutation({
    mutationFn: ({ id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  // Delete user
  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
    },
  });

  // Save reviewer
  const saveReviewerMutation = useMutation({
    mutationFn: (data) =>
      editReviewer
        ? base44.entities.GoogleReviewer.update(editReviewer.id, data)
        : base44.entities.GoogleReviewer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviewers"] });
      setShowReviewerDialog(false);
      setEditReviewer(null);
      setReviewerEmail("");
      setReviewerName("");
      setReviewerNotes("");
    },
  });

  // Delete reviewer
  const deleteReviewerMutation = useMutation({
    mutationFn: (id) => base44.entities.GoogleReviewer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-reviewers"] }),
  });

  const openAddReviewer = () => {
    setEditReviewer(null);
    setReviewerEmail("");
    setReviewerName("");
    setReviewerNotes("");
    setShowReviewerDialog(true);
  };

  const openEditReviewer = (r) => {
    setEditReviewer(r);
    setReviewerEmail(r.email || "");
    setReviewerName(r.name || "");
    setReviewerNotes(r.notes || "");
    setShowReviewerDialog(true);
  };

  // Guard: only admins — must be after all hooks
  if (user && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const handleSaveReviewer = () => {
    saveReviewerMutation.mutate({
      email: reviewerEmail.trim(),
      name: reviewerName.trim(),
      notes: reviewerNotes.trim(),
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7c3aed, #f59e0b)" }}>
          <Crown className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Admin Control Panel</h1>
          <p className="text-sm text-slate-400">Full platform management</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="users" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-1.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="invite" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <UserPlus className="w-4 h-4 mr-1.5" /> Invite
          </TabsTrigger>
          <TabsTrigger value="reviewers" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Star className="w-4 h-4 mr-1.5" /> Google Reviewers
          </TabsTrigger>
        </TabsList>

        {/* ── USERS TAB ── */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{users.length} total users</p>
            <Button size="sm" variant="ghost" onClick={() => refetchUsers()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loadingUsers ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <Card key={u.id} className="border-white/10 bg-white/5">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-violet-600/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-violet-300">
                          {(u.full_name || u.email || "?")[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{u.full_name || "—"}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className={`text-xs border ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>
                        {u.role || "user"}
                      </Badge>
                      {u.id !== user?.id && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-slate-400 hover:text-yellow-400"
                            title={u.role === "admin" ? "Remove Admin" : "Make Admin"}
                            onClick={() => toggleRoleMutation.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}
                          >
                            {u.role === "admin" ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-slate-400 hover:text-red-400"
                            title="Remove User"
                            onClick={() => setConfirmDelete(u)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {u.id === user?.id && (
                        <span className="text-xs text-slate-500 italic">you</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── INVITE TAB ── */}
        <TabsContent value="invite" className="mt-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-violet-400" /> Invite New User
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Email Address</Label>
                <Input
                  placeholder="email@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Role</Label>
                <div className="flex gap-2">
                  {["user", "admin"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setInviteRole(r)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        inviteRole === r
                          ? "bg-violet-600 border-violet-500 text-white"
                          : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
                      }`}
                    >
                      {r === "admin" ? "Admin" : "Regular User"}
                    </button>
                  ))}
                </div>
              </div>

              {inviteMsg && (
                <div className={`flex items-center gap-2 text-sm rounded-lg p-3 ${
                  inviteMsg.type === "success"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {inviteMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {inviteMsg.text}
                </div>
              )}

              <Button
                onClick={handleInvite}
                disabled={inviteLoading || !inviteEmail.trim()}
                className="w-full"
                style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
              >
                {inviteLoading ? "Sending..." : "Send Invitation"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GOOGLE REVIEWERS TAB ── */}
        <TabsContent value="reviewers" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{reviewers.length} reviewer accounts</p>
            <Button
              size="sm"
              onClick={openAddReviewer}
              style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
            >
              <UserPlus className="w-4 h-4 mr-1" /> Add Reviewer
            </Button>
          </div>

          {loadingReviewers ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : reviewers.length === 0 ? (
            <Card className="border-white/10 bg-white/5">
              <CardContent className="py-10 text-center text-slate-400">
                <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No Google reviewer accounts added yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {reviewers.map((r) => (
                <Card key={r.id} className="border-white/10 bg-white/5">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                        <Star className="w-4 h-4 text-yellow-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{r.name || "Unnamed"}</p>
                        <p className="text-xs text-slate-400 truncate">{r.email}</p>
                        {r.notes && <p className="text-xs text-slate-500 truncate">{r.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-slate-400 hover:text-violet-400"
                        onClick={() => openEditReviewer(r)}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-slate-400 hover:text-red-400"
                        onClick={() => deleteReviewerMutation.mutate(r.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete User Confirm Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="border-white/10 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Remove User
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-300 text-sm">
            Are you sure you want to remove <strong>{confirmDelete?.email}</strong>? This cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteUserMutation.mutate(confirmDelete.id)}
            >
              Remove User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Reviewer Dialog */}
      <Dialog open={showReviewerDialog} onOpenChange={setShowReviewerDialog}>
        <DialogContent className="border-white/10 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400" />
              {editReviewer ? "Edit Reviewer" : "Add Google Reviewer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-slate-300">Name</Label>
              <Input
                placeholder="Reviewer name"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-300">Google Account Email</Label>
              <Input
                placeholder="reviewer@gmail.com"
                value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-slate-300">Notes (optional)</Label>
              <Input
                placeholder="e.g. Primary review account"
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowReviewerDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSaveReviewer}
              disabled={!reviewerEmail.trim() || saveReviewerMutation.isPending}
              style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
            >
              {saveReviewerMutation.isPending ? "Saving..." : editReviewer ? "Save Changes" : "Add Reviewer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}