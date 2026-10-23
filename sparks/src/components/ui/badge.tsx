/** Small coloured label. `color` comes from a lookup row (e.g. a status colour); falls back to grey. */
export function Badge({ children, color }: { children: React.ReactNode; color?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={color ? { borderColor: `${color}55`, backgroundColor: `${color}14`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? null : <Badge color="#6b7280">Inactive</Badge>;
}
