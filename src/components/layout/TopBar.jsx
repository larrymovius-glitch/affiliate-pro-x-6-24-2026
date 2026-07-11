import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { withTimeout } from "@/lib/withTimeout";
import { format } from "date-fns";
import { Menu, Bell, LogOut, Trash2, ChevronLeft, Moon, Sun } from "lucide-react";
import VoiceAtlasModal from "@/components/dashboard/VoiceAtlasModal";
import MobileAtlasDrawer from "@/components/dashboard/MobileAtlasDrawer";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";

export default function TopBar({ onMenuClick }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("affiliateProThemeMode") || "light");
  const isMobile = useIsMobile();
  const isRoot = location.pathname === "/";
  const initials = user?.full_name 
    ? user.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) 
    : "U";

  const { data: avatars = [] } = useQuery({
    queryKey: ["assistant-avatars"],
    queryFn: () => base44.entities.AssistantAvatar.list(),
  });
  const mayaAvatar = avatars.find(a => a.assistant === "maya");
  const displayAvatar = mayaAvatar?.file_url || "https://media.base44.com/images/public/6a2a72a46235784f879b968c/c0640056e_generated_image.png";


  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => withTimeout(
      base44.entities.Notification.filter({ user_id: user?.id }, "-created_date", 20),
      15000, "Loading notifications"
    ),
    enabled: Boolean(user?.id),
    refetchInterval: 60000,
  });
  const unreadCount = notifications.filter(n => !n.read).length;
  const handleOpenNotifications = (open) => {
    if (open && unreadCount > 0) {
      Promise.all(notifications.filter(n => !n.read).map(n => base44.entities.Notification.update(n.id, { read: true })))
        .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
        .catch(() => {});
    }
  };
  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    if (isDeleting) return;

    setIsDeleting(true);
    setDeleteError("");
    try {
      await base44.functions.invoke("deleteAccount", { password: deletePassword });
      await base44.auth.logout("/");
    } catch (error) {
      setDeleteError(error?.response?.data?.error || error?.message || "Unable to delete your account. Please try again.");
      setIsDeleting(false);
    }
  };

  const toggleThemeMode = () => {
    const nextTheme = themeMode === "dark" ? "light" : "dark";
    localStorage.setItem("affiliateProThemeMode", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setThemeMode(nextTheme);
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 backdrop-blur-xl flex items-center px-4 lg:px-6 bg-card/90 border-b border-border text-foreground"
        style={{
          minHeight: 56,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {/* Mobile: Back button when not on root, Hamburger menu on root */}
        {!isRoot ? (
          <Button variant="ghost" size="icon" className="mr-2 h-11 w-11" onClick={() => navigate(-1)} aria-label="Go back" style={{ userSelect: "none" }}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="mr-2 h-11 w-11" onClick={onMenuClick} aria-label="Open navigation menu" style={{ userSelect: "none" }}>
            <Menu className="w-5 h-5" />
          </Button>
        )}

        <div className="flex-1 flex items-center">
          <button
            onClick={() => setAtlasOpen(true)}
            aria-label="Open Maya assistant"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full transition-all hover:scale-[1.03] active:scale-95 bg-background/85 shadow-sm shadow-primary/10 ring-1 ring-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{ userSelect: "none" }}
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/10 flex-shrink-0 ring-1 ring-primary/20">
              <img
                src={displayAvatar}
                alt="AI Assistant"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs font-bold text-foreground">
              Ask Maya
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground h-11 w-11"
            onClick={toggleThemeMode}
            aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{ userSelect: "none" }}
          >
            {themeMode === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <DropdownMenu onOpenChange={handleOpenNotifications}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-muted-foreground h-11 w-11" aria-label="Notifications" style={{ userSelect: "none" }}>
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {notifications.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <Bell className="w-5 h-5 mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-sm font-medium">You're all caught up</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No new notifications right now.</p>
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  {notifications.map((n) => (
                    <DropdownMenuItem key={n.id} onClick={() => n.link_to && navigate(n.link_to)} className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                      <div className="flex items-center gap-2 w-full">
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                        <p className="text-sm font-medium truncate">{n.title}</p>
                      </div>
                      {n.body && <p className="text-xs text-muted-foreground pl-3.5">{n.body}</p>}
                      {n.created_date && <p className="text-[10px] text-muted-foreground/70 pl-3.5">{format(new Date(n.created_date), "MMM d, h:mm a")}</p>}
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pl-2 pr-3 h-11" style={{ userSelect: "none" }}>
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="text-white text-xs font-bold" style={{ background: "linear-gradient(135deg, #7c3aed, #f59e0b)" }}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline">{user?.full_name || "User"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => base44.auth.logout("/")} className="h-11" style={{ userSelect: "none" }}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive h-11"
                style={{ userSelect: "none" }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isMobile ? (
        <MobileAtlasDrawer open={atlasOpen} onClose={() => setAtlasOpen(false)} />
      ) : (
        <VoiceAtlasModal open={atlasOpen} onClose={() => setAtlasOpen(false)} />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setDeleteConfirmEmail("");
          setDeletePassword("");
          setDeleteError("");
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent and cannot be undone. All your data will be removed. Enter your email address and current password to confirm your identity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            type="email"
            aria-label="Confirm email address"
            placeholder={user?.email || "your email address"}
            value={deleteConfirmEmail}
            onChange={(e) => setDeleteConfirmEmail(e.target.value)}
            className="h-11"
          />
          <Input
            type="password"
            aria-label="Current password"
            autoComplete="current-password"
            placeholder="Current password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            className="h-11"
          />
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteConfirmEmail.trim().toLowerCase() !== (user?.email || "").toLowerCase() || !deletePassword || isDeleting}
              onClick={handleDeleteAccount}
            >
              {isDeleting ? "Deleting..." : "Yes, Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}