import { cn } from "@/components/lib/utils.js";
import duckyLogoUrl from "@/assets/ducky-logo.png";

// Ducky Coder surface brand. Export names keep Ducky* for backward-compat imports.
export function DuckyAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={duckyLogoUrl}
      alt="Ducky Coder"
      className={cn("shrink-0 rounded-xl object-contain", className)}
      draggable={false}
    />
  );
}

export function DuckyCoderLogo({ className }: { className?: string }) {
  return (
    <img
      src={duckyLogoUrl}
      alt="Ducky Coder"
      className={cn("shrink-0 rounded-xl object-contain", className)}
      draggable={false}
    />
  );
}

export function DuckyWordmarkLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn("shrink-0 font-semibold tracking-tight text-current", className)}
      aria-hidden="true"
    >
      Ducky Coder
    </span>
  );
}
