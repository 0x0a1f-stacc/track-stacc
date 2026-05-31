import { Badge } from "@trackstacc/ui";
export function MechanicBadge({ mechanic }: { mechanic: string }) {
  return <Badge>{mechanic.replace(/_/gu, " ")}</Badge>;
}
