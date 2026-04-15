import { Nav } from "@/components/Nav";

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <div className="flex-1">{children}</div>
    </div>
  );
}
