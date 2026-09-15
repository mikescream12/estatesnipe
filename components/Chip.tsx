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
      className={`rounded-full border px-3 py-2 text-[0.85rem] ${
        active
          ? "border-ss-accent bg-[rgba(232,165,75,0.15)] text-ss-accent"
          : "border-ss-line bg-ss-input text-ss-text"
      }`}
    >
      {label}
    </button>
  );
}
