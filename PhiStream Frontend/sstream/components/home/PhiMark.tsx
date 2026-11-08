import Image from "next/image";

/** Shared logo asset used by the hero poster and CTA watermark. */

interface PhiMarkProps {
  className?: string;
  markOnly?: boolean;
  "aria-hidden"?: boolean | "true" | "false";
}

export function PhiMark({ className, markOnly = false, ...rest }: PhiMarkProps) {
  return (
    <Image
      src={markOnly ? "/phi-mark.webp" : "/logo-mark.webp"}
      alt=""
      width={markOnly ? 360 : 720}
      height={markOnly ? 360 : 380}
      className={className}
      aria-hidden={rest["aria-hidden"] ?? true}
      priority={className?.includes("pf-poster") ?? false}
      sizes="(max-width: 700px) 86vw, 720px"
    >
    </Image>
  );
}
