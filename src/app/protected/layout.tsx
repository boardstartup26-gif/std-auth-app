// app/(protected)/layout.tsx
import { Sidebar } from "@/app/_components/Sidebar";
import { MobileNav } from "@/app/_components/MobileNav";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[15rem_1fr]">
      <Sidebar />
      <div className="flex flex-col">
        <MobileNav />
        <main>{children}</main>
      </div>
    </div>
  );
}