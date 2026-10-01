import type { ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";

/**
 * The header row every `dialog.sheet` shares: the sheet title on the left and
 * the 20px `x` icon button on the right (the system's BottomSheet / Dialog).
 * Without a title only the close button renders, right-aligned — for sheets
 * whose content brings its own heading. The native <dialog> still owns Esc
 * and focus trapping; this button is the always-present touch alternative.
 */
export function SheetHeader({
  title,
  titleId,
  onClose,
}: {
  title?: ReactNode;
  titleId?: string;
  onClose: () => void;
}) {
  return (
    <div className="ar-sheet__header">
      {title !== undefined ? (
        <h2 id={titleId} className="ar-sheet__title">
          {title}
        </h2>
      ) : null}
      <button type="button" className="ar-btn ar-btn--icon" aria-label="Close" onClick={onClose}>
        <Icon name="x" size={20} />
      </button>
    </div>
  );
}
