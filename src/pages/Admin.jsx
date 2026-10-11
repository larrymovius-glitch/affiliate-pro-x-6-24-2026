import React, { useState, useMemo } from "react";
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
  Star, RefreshCw, Crown, AlertCircle, CheckCircle, Search, Edit2, ShoppingBag, ExternalLink, Medal, Image, Sparkles,
  Wallet, XCircle, Send, Radio, MapPin
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import AvatarUploader from "@/components/admin/AvatarUploader";
import PostbackSetup from "@/components/admin/PostbackSetup";
import MobileSelect from "@/components/ui/MobileSelect";

const VETERAN_STATUS_OPTIONS = [
  { value: "regular", label: "Regular User" },
  { value: "verified_veteran", label: "Verified Veteran" },
  { value: "disabled_vet", label: "Disabled Veteran" },
  { value: "homeless_vet", label: "Homeless Veteran" },
  { value: "pending_verification", label: "Pending Verification" },
];

const ATTEMPT_LABEL = {
  created: "Signed up",
  already_registered: "Email already has an account",
  invalid_email: "Invalid email",
  weak_password: "Password too weak",
  error: "Failed",
};
const ATTEMPT_STYLE = {
  created: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  already_registered: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  invalid_email: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  weak_password: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  error: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

// Their device's clock and their connection are in time zones hours apart:
// the connection is very likely going through a VPN or proxy, so the
// location shown may not be where they really are.
function VpnFlag({ deviceTz, ipTz }) {
  return (
    <p
      className="text-xs font-medium text-red-700 dark:text-red-300 flex items-center gap-1"
      title={`Their device's clock is set to ${deviceTz || "?"}, but their connection is in ${ipTz || "?"}.`}
    >
      <AlertCircle className="w-3 h-3 shrink-0" />
      Possible VPN: device clock {deviceTz || "?"}, connection {ipTz || "?"}
    </p>
  );
}

const ROLE_COLORS = {
  admin: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  user: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
};

// profiles.subscription_tier already existed in the schema before this UI
// did (see docs/applied-schema-fixes.sql) but nothing read or wrote it --
// the only levers admin had were role (admin/user) and veteran_status,
// with no way to hand someone a "pro" tier by hand. No feature in the app
// gates on this yet, so setting it here is a label/record for now, not a
// functional unlock -- worth knowing before using it to "give" someone
// something.
const TIER_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "veteran_free", label: "Veteran Free" },
];

const PAYOUT_STATUS_COLORS = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  approved: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  paid: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
};

const PAYOUT_FILTERS = ["pending", "approved", "paid", "rejected", "all"];

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
  const [editTier, setEditTier] = useState(null);
  const [payoutFilter, setPayoutFilter] = useState("pending");
  const [confirmPay, setConfirmPay] = useState(null);
  const [payError, setPayError] = useState(null);

  const { data: users = [], isLoading: loadingUsers, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: signupAttempts = [] } = useQuery({
    queryKey: ["admin-signup-attempts"],
    queryFn: async () => (await base44.functions.invoke("adminSignupAttempts", {})).data.attempts || [],
    refetchInterval: 60_000,
  });

  const { data: reviewers = [], isLoading: loadingReviewers } = useQuery({
    queryKey: ["admin-reviewers"],
    queryFn: () => base44.entities.GoogleReviewer.list(),
  });

  const [ebaySyncResult, setEbaySyncResult] = useState(null);
  const ebayCampaignId = user?.affiliate_network_ids?.ebay || null;

  const syncEbayMutation = useMutation({
    mutationFn: () => base44.functions.invoke("syncEbayTrending", {}),
    onSuccess: ({ data }) => setEbaySyncResult({ type: "success", ...data }),
    onError: (e) => setEbaySyncResult({ type: "error", message: e.message || "Sync failed" }),
  });

  const { data: payouts = [], isLoading: loadingPayouts, refetch: refetchPayouts } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: () => base44.entities.Payout.list("-requested_at"),
  });

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  const approvePayoutMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.Payout.update(id, { status: "approved" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-payouts"] }),
  });

  const rejectPayoutMutation = useMutation({
    mutationFn: (/** @type {any} */ id) => base44.entities.Payout.update(id, { status: "rejected" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-payouts"] }),
  });

  const payPayoutMutation = useMutation({
    mutationFn: (payoutId) => base44.functions.invoke("processStripePayout", { payoutId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
      setConfirmPay(null);
      setPayError(null);
    },
    onError: (e) => setPayError(e.message || "Failed to process payout"),
  });

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteMsg(null);
    try {
      await base44.functions.invoke("inviteUser", { email: inviteEmail.trim(), role: inviteRole });
      setInviteMsg({ type: "success", text: `Invitation sent to ${inviteEmail}` });
      setInviteEmail("");
      refetchUsers();
    } catch (e) {
      setInviteMsg({ type: "error", text: e.message || "Failed to invite user" });
    }
    setInviteLoading(false);
  };

  const toggleRoleMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, role }) => base44.entities.User.update(id, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const updateVeteranStatusMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, veteranStatus, veteranNotes }) =>
      base44.functions.invoke("reviewVeteranVerification", { userId: id, veteranStatus, veteranNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditVeteranStatus(null);
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: (/** @type {any} */ { id, tier }) => base44.functions.invoke("updateSubscriptionTier", { userId: id, tier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditTier(null);
    },
  });

  const openVeteranDocumentMutation = useMutation({
    mutationFn: (userId) => base44.functions.invoke("getVeteranVerificationDocument", { userId }),
    onSuccess: ({ data }) => window.open(data.url, "_blank", "noopener,noreferrer"),
  });

  const deleteUserMutation = useMutation({
    // The server removes the login too, not just the profile, so the person
    // can sign up again with the same email.
    mutationFn: (/** @type {any} */ u) => base44.functions.invoke("adminDeleteUser", { userId: u.id, email: u.email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
    },
    onError: (err) => alert(err?.message || "Couldn't remove that user."),
  });

  const saveReviewerMutation = useMutation({
    mutationFn: (/** @type {any} */ data) =>
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
    mutationFn: (/** @type {any} */ id) => base44.entities.GoogleReviewer.delete(id),
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

  const filteredPayouts = payoutFilter === "all" ? payouts : payouts.filter(p => p.status === payoutFilter);
  const pendingPayoutTotal = payouts.filter(p => p.status === "pending").reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #7c3aed, #f59e0b)", boxShadow: "0 0 24px rgba(124,58,237,0.4)" }}>
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Admin Control Panel</h1>
          <p className="text-sm text-muted-foreground">Manage users, roles, and reviewer accounts</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Users", value: users.length, icon: Users, color: "#7c3aed" },
          { label: "Admins", value: adminCount, icon: Crown, color: "#f59e0b" },
          { label: "Veterans", value: users.filter(u => u.veteran_status && u.veteran_status !== "regular").length, icon: Medal, color: "#10b981" },
          { label: "Reviewers", value: reviewers.length, icon: Star, color: "#10b981" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-card border border-border w-full max-w-full overflow-x-auto justify-start">
          <TabsTrigger value="users" className="flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-1.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="invite" className="flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <UserPlus className="w-4 h-4 mr-1.5" /> Invite
          </TabsTrigger>
          <TabsTrigger value="payouts" className="flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Wallet className="w-4 h-4 mr-1.5" /> Payouts
          </TabsTrigger>
          <TabsTrigger value="tracking" className="flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Radio className="w-4 h-4 mr-1.5" /> Tracking
          </TabsTrigger>
            <TabsTrigger value="reviewers" className="flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Star className="w-4 h-4 mr-1.5" /> Reviewers
          </TabsTrigger>
          <TabsTrigger value="ebay" className="flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <ShoppingBag className="w-4 h-4 mr-1.5" /> eBay
          </TabsTrigger>
          <TabsTrigger value="avatars" className="flex-shrink-0 data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <Image className="w-4 h-4 mr-1.5" /> Avatars
          </TabsTrigger>
        </TabsList>

        {/* ── USERS TAB ── */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Button size="icon" variant="ghost" onClick={() => refetchUsers()} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {loadingUsers ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No users found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <Card key={u.id} className="border-border bg-card hover:bg-muted transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                        style={{ background: u.role === "admin" ? "linear-gradient(135deg,#7c3aed,#f59e0b)" : "rgba(124,58,237,0.25)", color: "white" }}>
                        {(u.full_name || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{u.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {u.signup_country
                            ? `First seen: ${[u.signup_city, u.signup_region, u.signup_country].filter(Boolean).join(", ")}`
                            : "Location: not yet (fills in on their next visit)"}
                        </p>
                        {u.last_seen_country && (
                          <p
                            className={`text-xs truncate flex items-center gap-1 ${
                              u.signup_country && u.last_seen_country !== u.signup_country
                                ? "text-amber-700 dark:text-amber-300 font-medium"
                                : "text-muted-foreground"
                            }`}
                            title={u.signup_country && u.last_seen_country !== u.signup_country ? "Different country from where they first showed up" : undefined}
                          >
                            <MapPin className="w-3 h-3 shrink-0" />
                            Last seen: {[u.last_seen_city, u.last_seen_region, u.last_seen_country].filter(Boolean).join(", ")}
                            {u.last_seen_at ? ` · ${new Date(u.last_seen_at).toLocaleDateString()}` : ""}
                          </p>
                        )}
                        {u.last_seen_vpn_suspected && (
                          <VpnFlag deviceTz={u.last_seen_device_timezone} ipTz={u.last_seen_ip_timezone} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <div className="flex items-center gap-1 flex-wrap">
                       <Badge className={`text-xs border ${ROLE_COLORS[u.role] || ROLE_COLORS.user}`}>
                         {u.role || "user"}
                       </Badge>
                       {u.veteran_status && u.veteran_status !== "regular" && (
                         <Badge className="text-xs border bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                           <Medal className="w-3 h-3 mr-1" />
                           {u.veteran_status.replace("_", " ")}
                         </Badge>
                       )}
                       {u.subscription_tier && u.subscription_tier !== "free" && (
                         <Badge className="text-xs border bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30">
                           <Sparkles className="w-3 h-3 mr-1" />
                           {TIER_OPTIONS.find(t => t.value === u.subscription_tier)?.label || u.subscription_tier}
                         </Badge>
                       )}
                      </div>
                      {u.id !== user?.id ? (
                        <>
                          <Button size="sm" variant="ghost"
                           className="h-8 w-8 p-0 text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-400"
                           title="Set Veteran Status"
                           onClick={() => setEditVeteranStatus(u)}
                          >
                           <Medal className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost"
                           className="h-8 w-8 p-0 text-muted-foreground hover:text-violet-700 dark:hover:text-violet-300"
                           title="Set Subscription Tier"
                           onClick={() => setEditTier({ id: u.id, email: u.email, tier: u.subscription_tier || "free" })}
                          >
                           <Sparkles className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost"
                           className="h-8 w-8 p-0 text-muted-foreground hover:text-yellow-700 dark:hover:text-yellow-400"
                           title={u.role === "admin" ? "Remove Admin" : "Make Admin"}
                           onClick={() => toggleRoleMutation.mutate({ id: u.id, role: u.role === "admin" ? "user" : "admin" })}
                          >
                           {u.role === "admin" ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                          </Button>
                          <Button size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-700 dark:hover:text-red-300"
                            title="Remove User"
                            onClick={() => setConfirmDelete(u)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic px-1">you</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Every signup try, including ones that never became an account. */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Signup attempts
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Every try on the sign-up page, newest first, with where it came from (approximate, from the internet connection).
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {signupAttempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet. New tries show up here as they happen.</p>
              ) : (
                signupAttempts.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {[a.city, a.region, a.country].filter(Boolean).join(", ") || "Location unknown"}
                        {a.ip ? (
                          <>
                            {" · "}
                            <a className="underline" href={`https://search.arin.net/rdap/?query=${encodeURIComponent(a.ip)}`} target="_blank" rel="noopener noreferrer" title="Who owns this internet address (the official registry record)">
                              {a.ip}
                            </a>
                          </>
                        ) : ""}
                      </p>
                      {a.vpn_suspected && <VpnFlag deviceTz={a.device_timezone} ipTz={a.ip_timezone} />}
                    </div>
                    <div className="text-right">
                      <Badge className={`text-xs border ${ATTEMPT_STYLE[a.outcome] || ATTEMPT_STYLE.error}`}>
                        {ATTEMPT_LABEL[a.outcome] || a.outcome}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── INVITE TAB ── */}
        <TabsContent value="invite" className="mt-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-violet-700 dark:text-violet-300" /> Invite New User
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-foreground/80 text-sm">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground/80 text-sm">Role</Label>
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
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${inviteRole === value ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground"}`} />
                        <span className={`text-sm font-medium ${inviteRole === value ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {inviteMsg && (
                <div className={`flex items-center gap-2 text-sm rounded-xl p-3 ${
                  inviteMsg.type === "success"
                    ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
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

        {/* ── PAYOUTS TAB ── */}
        <TabsContent value="payouts" className="mt-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              {payouts.filter(p => p.status === "pending").length} pending · ${pendingPayoutTotal.toFixed(2)} awaiting review
            </p>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={() => refetchPayouts()} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PAYOUT_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setPayoutFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize border transition-colors ${
                  payoutFilter === f
                    ? "border-violet-500 bg-violet-600/30 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {loadingPayouts ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />)}
            </div>
          ) : filteredPayouts.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-10 text-center text-muted-foreground">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No {payoutFilter !== "all" ? payoutFilter : ""} payouts.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredPayouts.map((p) => {
                const recipient = usersById[p.user_id] || usersById[p.created_by_id];
                const canPay = p.status === "approved" && recipient?.stripeAccountId;
                return (
                  <Card key={p.id} className="border-border bg-card hover:bg-muted transition-colors">
                    <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">${Number(p.amount).toFixed(2)}</p>
                          <Badge className={`text-xs border ${PAYOUT_STATUS_COLORS[p.status] || PAYOUT_STATUS_COLORS.pending}`}>
                            {p.status}
                          </Badge>
                          {p.source === "auto" && (
                            <Badge variant="outline" className="text-xs border-border text-muted-foreground">auto</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {recipient?.email || p.payment_email || "Unknown recipient"} · {p.payment_method || "—"}
                        </p>
                        {p.status === "approved" && !recipient?.stripeAccountId && (
                          <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Recipient hasn't connected Stripe yet
                          </p>
                        )}
                        {p.status === "paid" && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Paid {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : ""}{p.notes ? ` · ${p.notes}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {p.status === "pending" && (
                          <>
                            <Button size="sm" variant="ghost"
                              className="h-8 text-emerald-700 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-500/10"
                              disabled={approvePayoutMutation.isPending}
                              onClick={() => approvePayoutMutation.mutate(p.id)}>
                              <CheckCircle className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="ghost"
                              className="h-8 text-red-700 dark:text-red-300 hover:text-red-700 dark:hover:text-red-200 hover:bg-red-500/10"
                              disabled={rejectPayoutMutation.isPending}
                              onClick={() => rejectPayoutMutation.mutate(p.id)}>
                              <XCircle className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {p.status === "approved" && (
                          <Button size="sm"
                            className="h-8"
                            style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
                            disabled={!canPay}
                            title={canPay ? "" : "Recipient hasn't connected a Stripe payout account"}
                            onClick={() => { setPayError(null); setConfirmPay(p); }}>
                            <Send className="w-4 h-4 mr-1" /> Pay Now
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── REVIEWERS TAB ── */}
        <TabsContent value="reviewers" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{reviewers.length} reviewer account{reviewers.length !== 1 ? "s" : ""}</p>
            <Button size="sm" onClick={openAddReviewer} style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}>
              <UserPlus className="w-4 h-4 mr-1.5" /> Add Reviewer
            </Button>
          </div>

          {loadingReviewers ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />)}
            </div>
          ) : reviewers.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-12 text-center">
                <Star className="w-10 h-10 mx-auto mb-3 text-yellow-500/30" />
                <p className="text-sm text-muted-foreground mb-1">No reviewer accounts yet</p>
                <p className="text-xs text-muted-foreground">Add Google accounts for Play Store reviewing</p>
                <Button size="sm" className="mt-4" onClick={openAddReviewer}
                  style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}>
                  <UserPlus className="w-4 h-4 mr-1.5" /> Add First Reviewer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {reviewers.map((r) => (
                <Card key={r.id} className="border-border bg-card hover:bg-muted transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center flex-shrink-0">
                        <Star className="w-4 h-4 text-yellow-700 dark:text-yellow-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.name || "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                        {r.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{r.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-violet-700 dark:hover:text-violet-300"
                        onClick={() => openEditReviewer(r)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-red-700 dark:hover:text-red-300"
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
        {/* ── TRACKING TAB ── */}
        <TabsContent value="tracking" className="mt-4">
          <PostbackSetup />
        </TabsContent>

        {/* ── AVATARS TAB ── */}
        <TabsContent value="avatars" className="mt-4">
          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <AvatarUploader />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EBAY TAB ── */}
        <TabsContent value="ebay" className="mt-4 space-y-4">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-foreground text-base flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-yellow-700 dark:text-yellow-400" /> eBay Trending Sync
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Campaign ID status */}
              <div className={`flex items-center gap-3 rounded-xl p-4 ${ebayCampaignId ? "bg-green-500/10 border border-green-500/20" : "bg-orange-500/10 border border-orange-500/20"}`}>
                {ebayCampaignId
                  ? <CheckCircle className="w-5 h-5 text-green-700 dark:text-green-400 flex-shrink-0" />
                  : <AlertCircle className="w-5 h-5 text-orange-700 dark:text-orange-300 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${ebayCampaignId ? "text-green-700 dark:text-green-300" : "text-orange-700 dark:text-orange-300"}`}>
                    {ebayCampaignId ? `Campaign ID saved: ${ebayCampaignId}` : "No EPN Campaign ID saved"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ebayCampaignId
                      ? "Real eBay products will be linked with this campaign so clicks are tracked and earn commission."
                      : "Save your eBay Partner Network Campaign ID on the Networks page before syncing."}
                  </p>
                </div>
              </div>

              {!ebayCampaignId && (
                <a href="/networks">
                  <Button variant="outline" className="w-full gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> Go to Networks page
                  </Button>
                </a>
              )}

              {ebaySyncResult && (
                <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${
                  ebaySyncResult.type === "success"
                    ? "bg-green-500/10 text-green-700 dark:text-green-300 border border-green-500/20"
                    : "bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
                }`}>
                  {ebaySyncResult.type === "success"
                    ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  <span>{ebaySyncResult.message}</span>
                </div>
              )}

              <Button
                className="w-full h-11 font-semibold gap-2"
                style={{ background: "linear-gradient(90deg, #0064d2, #0099d4)" }}
                disabled={!ebayCampaignId || syncEbayMutation.isPending}
                onClick={() => { setEbaySyncResult(null); syncEbayMutation.mutate(); }}
              >
                <RefreshCw className={`w-4 h-4 ${syncEbayMutation.isPending ? "animate-spin" : ""}`} />
                {syncEbayMutation.isPending ? "Syncing…" : "Sync Trending Products Now"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Also runs automatically every day. Pulls real trending eBay items via the Browse API and creates
                tracked affiliate links using your saved Campaign ID.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete User Confirm Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle className="text-red-700 dark:text-red-300 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> Remove User
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-foreground/80 text-sm">
              Are you sure you want to remove <strong className="text-foreground">{confirmDelete?.email}</strong>?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Their login, links, products and ads are deleted and any subscription is cancelled. They can sign up
              again with the same email. This can't be undone.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-muted-foreground" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive"
              disabled={deleteUserMutation.isPending}
              onClick={() => deleteUserMutation.mutate(confirmDelete)}>
              {deleteUserMutation.isPending ? "Removing…" : "Remove User"}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>

        {/* Veteran Status Dialog */}
        <Dialog open={!!editVeteranStatus} onOpenChange={() => setEditVeteranStatus(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground">
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
            <Button
              type="button"
              variant="outline"
              onClick={() => openVeteranDocumentMutation.mutate(editVeteranStatus.id)}
              disabled={openVeteranDocumentMutation.isPending}
            >
              {openVeteranDocumentMutation.isPending ? "Opening document..." : "Open verification document"}
            </Button>
            <div className="space-y-2">
              <Label className="text-foreground/80">Veteran Status</Label>
              <MobileSelect
                value={editVeteranStatus?.veteranStatus || "regular"}
                onValueChange={(val) => setEditVeteranStatus(prev => ({ ...prev, veteranStatus: val }))}
                options={VETERAN_STATUS_OPTIONS}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/80">Admin Notes</Label>
              <textarea
                value={editVeteranStatus?.veteranNotes || ""}
                onChange={(e) => setEditVeteranStatus(prev => ({ ...prev, veteranNotes: e.target.value }))}
                placeholder="Documentation notes..."
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground min-h-[100px]"
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

        {/* Subscription Tier Dialog */}
        <Dialog open={!!editTier} onOpenChange={() => setEditTier(null)}>
        <DialogContent className="border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-700 dark:text-violet-300" />
              Set Subscription Tier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">{editTier?.email}</div>
            <p className="text-xs text-muted-foreground">
              No feature in the app gates on this yet -- this records a tier for the account, it doesn't unlock or restrict anything today.
            </p>
            <div className="space-y-2">
              <Label className="text-foreground/80">Tier</Label>
              <MobileSelect
                value={editTier?.tier || "free"}
                onValueChange={(val) => setEditTier(prev => ({ ...prev, tier: val }))}
                options={TIER_OPTIONS}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditTier(null)}>Cancel</Button>
              <Button
                onClick={() => updateTierMutation.mutate({ id: editTier.id, tier: editTier.tier })}
                disabled={updateTierMutation.isPending}
              >
                {updateTierMutation.isPending ? "Saving..." : "Save Tier"}
              </Button>
            </div>
          </div>
        </DialogContent>
        </Dialog>

        {/* Pay Payout Confirm Dialog */}
        <Dialog open={!!confirmPay} onOpenChange={(open) => { if (!open) { setConfirmPay(null); setPayError(null); } }}>
          <DialogContent className="border-border bg-popover text-popover-foreground">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-violet-700 dark:text-violet-300" />
                Confirm Payout
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <p className="text-foreground/80 text-sm">
                Send <strong className="text-foreground">${confirmPay ? Number(confirmPay.amount).toFixed(2) : ""}</strong> to{" "}
                <strong className="text-foreground">
                  {confirmPay ? (usersById[confirmPay.user_id] || usersById[confirmPay.created_by_id])?.email : ""}
                </strong>{" "}
                via Stripe? This transfers real money and cannot be undone from here.
              </p>
              {payError && (
                <div className="flex items-center gap-2 text-sm rounded-xl p-3 bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {payError}
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" className="text-muted-foreground" onClick={() => { setConfirmPay(null); setPayError(null); }}>Cancel</Button>
              <Button
                disabled={payPayoutMutation.isPending}
                style={{ background: "linear-gradient(90deg, #7c3aed, #f59e0b)" }}
                onClick={() => payPayoutMutation.mutate(confirmPay.id)}>
                {payPayoutMutation.isPending ? "Sending…" : "Send Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add/Edit Reviewer Dialog */}
      <Dialog open={showReviewerDialog} onOpenChange={setShowReviewerDialog}>
        <DialogContent className="border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-700 dark:text-yellow-400" />
              {editReviewer ? "Edit Reviewer" : "Add Google Reviewer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-foreground/80 text-sm">Name</Label>
              <Input placeholder="Reviewer name" value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground/80 text-sm">Google Account Email</Label>
              <Input placeholder="reviewer@gmail.com" value={reviewerEmail}
                onChange={(e) => setReviewerEmail(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground/80 text-sm">Notes (optional)</Label>
              <Input placeholder="e.g. Primary review account" value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                className="bg-card border-border text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-muted-foreground" onClick={() => setShowReviewerDialog(false)}>Cancel</Button>
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