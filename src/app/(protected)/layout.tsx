// layout.tsx
import { Sidebar } from "@/app/_components/Sidebar";
import { MobileNav } from "@/app/_components/MobileNav";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background md:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main>{children}</main>
      </div>
    </div>
  );
}