// Shell for /progress and its three sections (Fix List, Leakage Map,
// Reattempt Gain). Only sets the body face (Inter); each page
// renders its own header through ProgressFrame, because the four headers differ.

export default function ProgressLayout({ children }: { children: React.ReactNode }) {
  return <div className="font-body">{children}</div>;
}
