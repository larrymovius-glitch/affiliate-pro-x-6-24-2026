import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground focus:shadow-lg">
        Skip to main content
      </a>
      {/* Sidebar: always rendered, toggled on all screen sizes */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(prev => !prev)} />
        <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
          <div
            key={location.pathname}
            className="page-enter py-4 px-4 landscape:pl-[max(1rem,env(safe-area-inset-left))] landscape:pr-[max(1rem,env(safe-area-inset-right))] lg:py-6 lg:px-6 lg:landscape:pl-[max(1.5rem,env(safe-area-inset-left))] lg:landscape:pr-[max(1.5rem,env(safe-area-inset-right))] max-w-7xl mx-auto pb-20 lg:pb-6"
          >
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}