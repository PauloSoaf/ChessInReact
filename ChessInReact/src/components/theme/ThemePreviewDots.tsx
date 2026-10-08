export function ThemePreviewDots({ colors }: { colors: [string, string, string] }) {
  return (
    <div className="flex -space-x-1 ml-auto">
      {colors.map((color, idx) => (
        <div
          key={idx}
          className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/10 shadow-sm"
          style={{ backgroundColor: color, zIndex: 3 - idx }}
        />
      ))}
    </div>
  );
}
