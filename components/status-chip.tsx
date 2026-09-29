import { STATE_LABELS, STATE_TONES } from "@/lib/execute/format";
import type { AddressState } from "@/lib/execute/types";

/** Where an address's money is, as a dot and a word. */
export function StatusChip({ state }: { state: AddressState }) {
  return (
    <span className="status" data-tone={STATE_TONES[state]}>
      <span className="status-dot" aria-hidden="true" />
      {STATE_LABELS[state]}
    </span>
  );
}
