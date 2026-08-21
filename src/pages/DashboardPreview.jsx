import PreviewDashboard from "@/components/preview/PreviewDashboard";
import AgentDock from "@/components/preview/AgentDock";

/**
 * DashboardPreview — the blue/gold dashboard, live at "/" and also reachable
 * at "/dashboard-preview". Wired to real Supabase data (see PreviewDashboard).
 * Not routed through AppLayout on purpose, so it renders full-bleed with its
 * own nav instead of inside the sidebar shell.
 */
export default function DashboardPreview() {
  return (
    <>
      <PreviewDashboard />
      <AgentDock />
    </>
  );
}
