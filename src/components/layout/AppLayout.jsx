import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const location = useLocation();

  return (
    <div className="dark flex h-screen overflow-hidden" style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #1a1040 100%)" }}>
      {/* Sidebar: always rendered, toggled on all screen sizes */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setSidebarOpen(prev => !prev)} />
        <main className="flex-1 overflow-y-auto">
          <div
            key={location.pathname}
            className="page-enter p-4 lg:p-6 max-w-7xl mx-auto pb-20 lg:pb-6"
          >
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}