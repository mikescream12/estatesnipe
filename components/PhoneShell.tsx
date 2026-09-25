import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[480px] px-4 pb-12 pt-5 sm:pt-8 md:max-w-5xl md:px-6">
      {children}
    </div>
  );
}
