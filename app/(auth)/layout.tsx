export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-gradient-to-b from-muted/40 via-background to-background">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">{children}</div>
    </div>
  );
}
