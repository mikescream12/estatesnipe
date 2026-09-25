"use client";

type ChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

export function Chip({ label, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-[0.85rem] font-semibold transition ${
        active
          ? "border-ss-accent bg-ss-brand-50 text-ss-accent"
          : "border-ss-line bg-ss-card text-ss-text hover:border-ss-accent/40"
      }`}
    >
      {label}
    </button>
  );
}
