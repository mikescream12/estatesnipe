import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[390px] px-4 pb-10 pt-4 sm:pt-6">
      {children}
    </div>
  );
}
