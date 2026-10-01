import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons/Icon";

/**
 * The system's detail-screen app bar: a plain back chevron (an icon button
 * whose accessible name says where it goes), the screen title, and an
 * optional trailing action. `titleAs="span"` when the page's h1 lives below
 * the bar (the instrument page's ticker); `size="sm"` for the centred
 * compact title.
 */
export function BackAppBar({
  href,
  backLabel,
  title,
  titleAs = "h1",
  size = "md",
  trailing,
}: {
  href: string;
  backLabel: string;
  title: ReactNode;
  titleAs?: "h1" | "span";
  size?: "md" | "sm";
  trailing?: ReactNode;
}) {
  const Title = titleAs;
  return (
    <div className="ar-appbar">
      <Link href={href} className="ar-btn ar-btn--icon ar-btn--plain" aria-label={backLabel}>
        <Icon name="chevron-left" />
      </Link>
      <Title className={`ar-appbar__title${size === "sm" ? " ar-appbar__title--sm" : ""}`}>
        {title}
      </Title>
      {trailing}
    </div>
  );
}
