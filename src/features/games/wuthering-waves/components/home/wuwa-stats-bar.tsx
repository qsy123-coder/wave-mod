import { Download, Grid3X3, RefreshCw, Star, Users } from "lucide-react";

const stats = [
  { icon: Download, value: "25K+", label: "Mods Available" },
  { icon: Users, value: "18K+", label: "Active Users" },
  { icon: Star, value: "4.9", label: "User Rating" },
  { icon: Grid3X3, value: "100+", label: "Categories" },
  { icon: RefreshCw, value: "Daily", label: "Updates" },
] as const;

export function WuwaStatsBar() {
  return (
    <div className="border-b border-t border-white/5 bg-[#0d1117]">
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/5 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-5 py-3">
            <Icon className="size-5 text-blue-400" />
            <div>
              <p className="text-base font-black text-white">{value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
