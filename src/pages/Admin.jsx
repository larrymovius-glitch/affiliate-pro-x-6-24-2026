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
  Star, RefreshCw, Settings, Crown, AlertCircle, CheckCircle, Search, Edit2, ShoppingBag, Link2, Medal
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
  const [userSearch, setUserSearch] = useState("");

  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [showReviewerDialog, setShowReviewerDialog] = useState(false);
  const [editReviewer, setEditReviewer] = useState(null);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editVeteranStatus, setEditVeteranStatus] = useState(null);

  const { data: users = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: reviewers = [], isLoading: loadingReviewers } = useQuery({
    queryKey: ["admin-reviewers"],
    queryFn: () => base44.entities.GoogleReviewer.list(),
  });

  const { data: ebayTokens = [], refetch: refetchEbay } = useQuery({
    queryKey: ["admin-ebay-token"],
    queryFn: () => base44.entities.EbayToken.list(),
  });
  const ebayConnected = ebayTokens.length > 0;
  const ebayToken = ebayTokens[0];

  const disconnectEbayMutation = useMutation({
    mutationFn: () => base44.entities.EbayToken.deleteMany({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-ebay-token"] }),
  });

  const EBAY_SIGNIN_URL = "https://signin.ebay.com/ws/eBayISAPI.dll?SignIn&runame=Lawerence_Moviu-Lawerenc-Affili-zgqyaq";

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

  const toggleRoleMutation = useMutation({
    mutationFn: ({ id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const updateVeteranStatusMutation = useMutation({
    mutationFn: ({ id, veteranStatus, veteranNotes }) => 
      base44.entities.User.update(id, { veteranStatus, veteranNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditVeteranStatus(null);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
    },
  });

  const saveReviewerMutation = useMutation({
    mutationFn: (data) =>
      editReviewer
        ? base44.entities.GoogleReviewer.update(editReviewer.id, data)
        : base44.entities.GoogleReviewer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviewers"] });
      setShowReviewerDialog(false);
      setEditReviewer(null);
      setReviewerEmail(""); setReviewerName(""); setReviewerNotes("");
    },
  });

  const deleteReviewerMutation = useMutation({
    mutationFn: (id) => base44.entities.GoogleReviewer.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-reviewers"] }),
  });

  const openAddReviewer = () => {
    setEditReviewer(null);
    setReviewerEmail(""); setReviewerName(""); setReviewerNotes("");
    setShowReviewerDialog(true);
  };

  const openEditReviewer = (r) => {
    setEditReviewer(r);
    setReviewerEmail(r.email || ""); setReviewerName(r.name || ""); setReviewerNotes(r.notes || "");
    setShowReviewerDialog(true);
  };

  const openVeteranDialog = (u) => {
    setEditVeteranStatus({
      id: u.id,
      veteranStatus: u.veteran_status || "regular",
      veteranNotes: u.veteran_notes || "",
      email: u.email
    });
  };

  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  const adminCount = users.filter(u => u.role === "admin").length;
  const filteredUsers = users.filter(u =>
    !userSearch || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.full_name?.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #7c3aed, #f59e0b)", boxShadow: "0 0 24px rgba(124,58,237,0.4)" }}>
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Admin Control Panel</h1>
          <p className="text-sm text-slate-400">Manage users, roles, and reviewer accounts</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: users.length, icon: Users, color: "#7c3aed" },
          { label: "Admins", value: adminCount, icon: Crown, color: "#f59e0b" },
          { label: "Veterans", value: users.filter(u => u.veteran_status && u.veteran_status !== "regular").length, icon: Medal, color: "#10b981" },
          { label: "Reviewers", value: reviewers.length, icon: Star, color: "#10b981" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-white/10 bg-white/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-white/5 border border-white/10 w-full">
          <TabsTrigger value="users" className="flex-1 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-1.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="invite" className="flex-1 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <UserPlus className="w-4 h-4 mr-1.5" /> Invite
          </TabsTrigger>
            <TabsTrigger value="reviewers" className="flex-1 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Star className="w-4 h-4 mr-1.5" /> Reviewers
          </TabsTrigger>
          <TabsTrigger value="ebay" className="flex-1 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <ShoppingBag className="w-4 h-4 mr-1.5" /> eBay
          </TabsTrigger>
        </TabsList>

        {/* ── USERS TAB ── */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search by name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
            <Button size="icon" variant="ghost" onClick={() => refetchUsers()} className="flex-shrink-0 text-slate-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loadingUsers ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <Card className="border-white/10 bg-white/5">
              <CardContent className="py-10 text-center text-slate-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No users found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <Card key={u.id} className="border-white/10 bg-white/5 hover:bg-white/8 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                        style={{ background: u.role === "admin" ? "linear-gradient(135deg,#7c3aed,#f59e0b)" : "rgba(124,58,237,0.25)", color: "white" }}>
                        {(u.full_name || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{u.full_name || "—"}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1">
                       <Badge className={`text-xs border ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>
                         {u.role || "user"}
                       </Badge>
                       {u.veteran_status && u.veteran_status !== "regular" && (
                         <Badge className="text-xs border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                           <Medal className="w-3 h-3 mr-1" />
                           {u.veteran_status.replace("_", " ")}
                         </Badge>
                       )}
                      </div>
                      {u.id !== user?.id ? (
                        <>
                          <Button size="sm" variant="ghost"
                           className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-400"
                           title="Set Veteran Status"
                           onClick={() => setEditVeteranStatus(u)}
                          >
                           <Medal className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost"
                           className="h-8 w-8 p-0 text-slate-400 hover:text-yellow-400"
                           title={u.role === "admin" ? "Remove Admin" : "Make Admin"}
                           onClick={() => toggleRoleMutation.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}
                          >
                           {u.role === "admin" ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                          </Button>
                          <Button size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-400"
                            title="Remove User"
                            onClick={() => setConfirmDelete(u)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500 italic px-1">you</span>
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
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "user", label: "Regular User", desc: "Standard platform access", icon: Users },
                    { value: "admin", label: "Admin", desc: "Full control panel access", icon: Crown },
                  ].map(({ value, label, desc, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setInviteRole(value)}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        inviteRole === value
                          ? "border-violet-500 bg-violet-600/20"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${inviteRole === value ? "text-violet-400" : "text-slate-500"}`} />
                        <span className={`text-sm font-medium ${inviteRole === value ? "text-white" : "text-slate-400"}`}>{label}</span>
                      </div>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {inviteMsg && (
                <div className={`flex items-center gap-2 text-sm rounded-xl p-3 ${
                  inviteMsg.type === "success"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {inviteMsg.type === "success" ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  {inviteMsg.text}
                </div>
              )}

              <Button
                onClick={handleInvite}
                disabled={inviteLoading || !inviteEmail.trim()}
                className="w-full h-11 font-semibold"
                style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
              >
                {inviteLoading ? "Sending Invite…" : "Send Invitation"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── REVIEWERS TAB ── */}
        <TabsContent value="reviewers" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">{reviewers.length} reviewer account{reviewers.length !== 1 ? "s" : ""}</p>
            <Button size="sm" onClick={openAddReviewer} style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}>
              <UserPlus className="w-4 h-4 mr-1.5" /> Add Reviewer
            </Button>
          </div>

          {loadingReviewers ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : reviewers.length === 0 ? (
            <Card className="border-white/10 bg-white/5">
              <CardContent className="py-12 text-center">
                <Star className="w-10 h-10 mx-auto mb-3 text-yellow-500/30" />
                <p className="text-sm text-slate-400 mb-1">No reviewer accounts yet</p>
                <p className="text-xs text-slate-500">Add Google accounts for Play Store reviewing</p>
                <Button size="sm" className="mt-4" onClick={openAddReviewer}
                  style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}>
                  <UserPlus className="w-4 h-4 mr-1.5" /> Add First Reviewer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {reviewers.map((r) => (
                <Card key={r.id} className="border-white/10 bg-white/5 hover:bg-white/8 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center flex-shrink-0">
                        <Star className="w-4 h-4 text-yellow-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{r.name || "Unnamed"}</p>
                        <p className="text-xs text-slate-400 truncate">{r.email}</p>
                        {r.notes && <p className="text-xs text-slate-500 truncate mt-0.5">{r.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-violet-400"
                        onClick={() => openEditReviewer(r)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-400"
                        onClick={() => deleteReviewerMutation.mutate(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        {/* ── EBAY TAB ── */}
        <TabsContent value="ebay" className="mt-4 space-y-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-yellow-400" /> eBay Account Connection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status */}
              <div className={`flex items-center gap-3 rounded-xl p-4 ${ebayConnected ? "bg-green-500/10 border border-green-500/20" : "bg-orange-500/10 border border-orange-500/20"}`}>
                {ebayConnected
                  ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  : <AlertCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${ebayConnected ? "text-green-300" : "text-orange-300"}`}>
                    {ebayConnected ? "eBay Account Connected" : "Not Connected"}
                  </p>
                  {ebayConnected && ebayToken?.connected_at && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Connected on {new Date(ebayToken.connected_at).toLocaleDateString()}
                      {ebayToken.expires_at && ` · Expires ${new Date(ebayToken.expires_at).toLocaleDateString()}`}
                    </p>
                  )}
                  {!ebayConnected && (
                    <p className="text-xs text-slate-400 mt-0.5">Connect your eBay account to enable affiliate tracking</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => refetchEbay()} className="ml-auto text-slate-400 hover:text-white flex-shrink-0">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              {/* RuName info */}
              <div className="rounded-xl p-4 bg-white/5 border border-white/10 space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">RuName</p>
                <p className="text-sm text-slate-300 font-mono break-all">Lawerence_Moviu-Lawerenc-Affili-zgqyaq</p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <a href={EBAY_SIGNIN_URL} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full h-11 font-semibold gap-2" style={{ background: "linear-gradient(90deg, #0064d2, #0099d4)" }}>
                    <Link2 className="w-4 h-4" />
                    {ebayConnected ? "Reconnect eBay Account" : "Connect eBay Account"}
                  </Button>
                </a>
                {ebayConnected && (
                  <Button
                    variant="ghost"
                    className="w-full h-10 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    disabled={disconnectEbayMutation.isPending}
                    onClick={() => disconnectEbayMutation.mutate()}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {disconnectEbayMutation.isPending ? "Disconnecting…" : "Disconnect eBay Account"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
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
          <div className="py-2">
            <p className="text-slate-300 text-sm">
              Are you sure you want to remove <strong className="text-white">{confirmDelete?.email}</strong>?
            </p>
            <p className="text-xs text-slate-500 mt-1">This action cannot be undone.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-slate-400" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive"
              disabled={deleteUserMutation.isPending}
              onClick={() => deleteUserMutation.mutate(confirmDelete.id)}>
              {deleteUserMutation.isPending ? "Removing…" : "Remove User"}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>

        {/* Veteran Status Dialog */}
        <Dialog open={!!editVeteranStatus} onOpenChange={() => setEditVeteranStatus(null)}>
        <DialogContent className="border-white/10 bg-slate-900 text-white">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Medal className="w-5 h-5 text-emerald-500" />
              Set Veteran Status
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {editVeteranStatus?.email}
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Veteran Status</Label>
              <select
                value={editVeteranStatus?.veteranStatus || "regular"}
                onChange={(e) => setEditVeteranStatus(prev => ({ ...prev, veteranStatus: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="regular">Regular User</option>
                <option value="verified_veteran">Verified Veteran</option>
                <option value="disabled_vet">Disabled Veteran</option>
                <option value="homeless_vet">Homeless Veteran</option>
                <option value="pending_verification">Pending Verification</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Admin Notes</Label>
              <textarea
                value={editVeteranStatus?.veteranNotes || ""}
                onChange={(e) => setEditVeteranStatus(prev => ({ ...prev, veteranNotes: e.target.value }))}
                placeholder="Documentation notes..."
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white min-h-[100px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditVeteranStatus(null)}>Cancel</Button>
              <Button 
                onClick={() => updateVeteranStatusMutation.mutate({
                  id: editVeteranStatus.id,
                  veteranStatus: editVeteranStatus.veteranStatus,
                  veteranNotes: editVeteranStatus.veteranNotes
                })}
                disabled={updateVeteranStatusMutation.isPending}
              >
                {updateVeteranStatusMutation.isPending ? "Saving..." : "Save Status"}
              </Button>
            </div>
          </div>
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
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Name</Label>
              <Input placeholder="Reviewer name" value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Google Account Email</Label>
              <Input placeholder="reviewer@gmail.com" value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Notes (optional)</Label>
              <Input placeholder="e.g. Primary review account" value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-slate-400" onClick={() => setShowReviewerDialog(false)}>Cancel</Button>
            <Button onClick={() => saveReviewerMutation.mutate({ email: reviewerEmail.trim(), name: reviewerName.trim(), notes: reviewerNotes.trim() })}
              disabled={!reviewerEmail.trim() || saveReviewerMutation.isPending}
              style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}>
              {saveReviewerMutation.isPending ? "Saving…" : editReviewer ? "Save Changes" : "Add Reviewer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}