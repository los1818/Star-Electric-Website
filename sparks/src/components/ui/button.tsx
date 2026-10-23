import Link from "next/link";

type Variant = "primary" | "dark" | "secondary" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-ink hover:bg-brand-dark",
  dark: "bg-ink text-white hover:bg-black",
  secondary: "border border-gray-300 bg-white text-ink hover:bg-gray-50",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md") {
  const pad = size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm";
  return `inline-flex items-center justify-center gap-1 rounded-md font-bold disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${VARIANTS[variant]}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function LinkButton({ href, variant = "primary", size = "md", children }: { href: string; variant?: Variant; size?: "sm" | "md"; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}
