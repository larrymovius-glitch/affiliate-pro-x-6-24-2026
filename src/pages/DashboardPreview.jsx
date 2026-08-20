import PreviewDashboard from "@/components/preview/PreviewDashboard";
import AgentDock from "@/components/preview/AgentDock";

/**
 * DashboardPreview — visual preview of the blue/gold mockup, side by side
 * with the live dashboard at "/". Placeholder data only. Not routed through
 * AppLayout on purpose, so it renders full-bleed like the mockup does instead
 * of inside the existing sidebar shell.
 */
export default function DashboardPreview() {
  return (
    <>
      <PreviewDashboard />
      <AgentDock />
    </>
  );
}
