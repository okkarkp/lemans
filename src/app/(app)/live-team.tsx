import { StatusBadge } from "@/components/ui";
import { timeSgt } from "@/lib/format";

interface Row {
  id: string; name: string; roleTitle: string; status: string;
  attendance: { location: string; strength: string; checkedInAt: string } | null;
}

export function LiveTeam({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th scope="col" className="py-2 font-semibold">Service personnel</th>
          <th scope="col" className="py-2 font-semibold">Status</th>
          <th scope="col" className="py-2 font-semibold">Where / when</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-2.5"><span className="font-medium">{r.name}</span><br /><span className="text-xs text-muted">{r.roleTitle}</span></td>
            <td className="py-2.5"><StatusBadge status={r.status} /></td>
            <td className="py-2.5 text-muted">
              {r.attendance ? `${r.attendance.location === "OFFICE" ? "Office" : "WFH"}, ${timeSgt(r.attendance.checkedInAt)} (${r.attendance.strength.toLowerCase()})` : "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
