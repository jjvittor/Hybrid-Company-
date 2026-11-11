import { useId } from "react";
import { HYBRD_INITIAL, YBRD_LOGO } from "@/lib/ybrd-logo";

type LogoProps = {
  variant?: "wordmark";
  className?: string;
  title?: string;
  brand?: "ybrd" | "hybrd";
  showDot?: boolean;
};
type DrawingProps = {
  design: "original" | "A" | "B" | "C";
  face: keyof typeof YBRD_LOGO;
  className?: string;
  title?: string;
  brand?: "ybrd" | "hybrd";
};

/** The lab and production component share exactly the same outlines. */
export function YbrdLogoDrawing({
  design,
  face,
  className,
  title = "YBRD",
  brand = "ybrd",
}: DrawingProps) {
  const titleId = useId();
  const drawing = YBRD_LOGO[face];
  const initial = brand === "hybrd" ? HYBRD_INITIAL[face] : null;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${drawing.width + (initial?.advance ?? 0)} ${drawing.cap}`}
      fill="currentColor"
      role="img"
      aria-labelledby={titleId}
      focusable="false"
    >
      <title id={titleId}>{title}</title>
      {initial && (
        <path data-letter="H" d={initial.path} className="text-signal" fill="currentColor" />
      )}
      <g transform={initial ? `translate(${initial.advance},0)` : undefined}>
        {drawing.paths[design].map((path, index) => (
          <path key={index} data-letter={"YBRD"[index]} d={path} fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}

export function YbrdLogo({
  variant = "wordmark",
  className = "",
  title,
  brand = "ybrd",
  showDot = brand === "ybrd",
}: LogoProps) {
  const titleId = useId();
  const drawing = YBRD_LOGO.unbounded;
  const initial = brand === "hybrd" ? HYBRD_INITIAL.unbounded : null;
  const width = drawing.width + (initial?.advance ?? 0) + (showDot ? 267 : 0);
  return (
    <span
      className={`ybrd-logo ${className}`}
      data-variant={variant}
      data-brand={brand}
      data-dot={showDot}
    >
      <svg
        className="ybrd-logo-mark"
        viewBox={`0 0 ${width} 750`}
        fill="currentColor"
        role="img"
        aria-labelledby={titleId}
        focusable="false"
      >
        <title id={titleId}>{title ?? brand.toUpperCase()}</title>
        {initial && (
          <path data-letter="H" d={initial.path} className="text-signal" fill="currentColor" />
        )}
        <g transform={initial ? `translate(${initial.advance},0)` : undefined}>
          {drawing.paths.A.map((path, index) => (
            <path key={index} data-letter={"YBRD"[index]} d={path} fill="currentColor" />
          ))}
        </g>
        {showDot && (
          <circle
            cx={width - 110}
            cy="660"
            r="90"
            className="text-signal"
            fill="currentColor"
            aria-hidden="true"
          />
        )}
      </svg>
    </span>
  );
}
