import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export function AppShell({
  teamId,
  boardId,
  topSlot,
  children,
}: {
  teamId?: string;
  boardId?: string;
  topSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar teamId={teamId} boardId={boardId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar>{topSlot}</TopBar>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
