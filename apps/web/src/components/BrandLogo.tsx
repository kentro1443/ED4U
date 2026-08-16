import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

type BrandLogoProps = {
  compact?: boolean;
  href?: string;
  className?: string;
  priority?: boolean;
};

/**
 * The supplied ED4U logo is the canonical brand asset. Its source artwork has
 * generous white presentation margins, so this component crops those margins
 * non-destructively and keeps the original pixels untouched.
 */
export function BrandLogo({ compact = false, href, className, priority = false }: BrandLogoProps) {
  const mark = (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden",
        compact ? "aspect-square w-9" : "aspect-[3.09/1] w-36 sm:w-40",
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src="/brand/ed4u-logo.png"
        alt=""
        width={1450}
        height={1086}
        priority={priority}
        sizes={compact ? "36px" : "160px"}
        className={cn(
          "pointer-events-none absolute max-w-none select-none",
          compact
            ? "-left-[84.9%] -top-[125%] h-[357.2%] w-[477%]"
            : "-left-[27.45%] -top-[125%] h-[357.2%] w-[154.3%]",
        )}
      />
    </span>
  );

  if (!href) {
    return (
      <span className="inline-flex" role="img" aria-label="ED4U">
        {mark}
      </span>
    );
  }

  return (
    <Link
      href={href}
      prefetch={false}
      aria-label="ED4U — về trang tổng quan"
      className="inline-flex rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-600)]"
    >
      {mark}
    </Link>
  );
}
