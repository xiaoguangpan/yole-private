import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Three-pane shell: Sidebar (240px) | Main (flex) | Inspector (320px).
 *
 * Stage 2 #1 placeholder. Real components land in #2-#7.
 *
 * The Top Bar is rendered as part of `main` (44px tall, integrates the
 * macOS traffic light via tauri.conf.json `titleBarStyle: "Overlay"`).
 * The traffic light position is set to {x: 16, y: 16} so the buttons
 * align with the 44px top bar gutter.
 */
export function AppShell({
  sidebar,
  main,
  inspector,
  inspectorVisible = true,
}: {
  sidebar: ReactNode;
  main: ReactNode;
  inspector: ReactNode;
  inspectorVisible?: boolean;
}) {
  return (
    <div className="flex h-screen w-screen min-w-[1120px] min-h-[720px] bg-app text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-app">
        {sidebar}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-app">{main}</main>

      {inspectorVisible && (
        <aside
          className={cn(
            "flex w-80 shrink-0 flex-col border-l border-line bg-app",
          )}
        >
          {inspector}
        </aside>
      )}
    </div>
  );
}
