import React, { useState } from "react";
import { Menu, Bell, LogOut, Trash2 } from "lucide-react";
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
import { useAuth } from "@/lib/AuthContext";

export default function TopBar({ onMenuClick }) {
  const { user } = useAuth();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const initials = user?.full_name 
    ? user.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) 
    : "U";

  const handleDeleteAccount = async () => {
    await base44.auth.logout("/");
  };

  return (
    <>
      <header
        className="sticky top-0 z-30 backdrop-blur-xl flex items-center px-4 lg:px-6"
        style={{
          background: "rgba(15,12,41,0.85)",
          borderBottom: "1px solid rgba(167,139,250,0.15)",
          minHeight: 56,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <Button variant="ghost" size="icon" className="lg:hidden mr-2 h-11 w-11" onClick={onMenuClick} style={{ userSelect: "none" }}>
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex-1 flex items-center">
          <a
            href={base44.agents.getWhatsAppConnectURL('phil')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full transition-all hover:opacity-90"
            style={{ background: "linear-gradient(90deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))", border: "1px solid rgba(245,158,11,0.4)", boxShadow: "0 0 12px rgba(245,158,11,0.15)", userSelect: "none" }}
          >
            <img
              src="https://media.base44.com/images/public/6a2a72a46235784f879b968c/e653cac7b_generated_image.png"
              alt="Phil the assistant"
              className="w-8 h-8 object-contain flex-shrink-0"
            />
            <span className="text-xs font-bold hidden sm:inline" style={{ background: "linear-gradient(90deg, #c084fc, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Ask Phil — he'll do the work!
            </span>
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative text-muted-foreground h-11 w-11" style={{ userSelect: "none" }}>
            <Bell className="w-5 h-5" />
          </Button>

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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent and cannot be undone. All your data will be removed. Are you sure you want to delete your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteAccount}
            >
              Yes, Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}