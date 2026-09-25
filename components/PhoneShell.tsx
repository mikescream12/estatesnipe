import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[480px] px-3 pb-10 pt-4 sm:px-4 sm:pt-6 md:max-w-5xl md:px-6">
      {children}
    </div>
  );
}
