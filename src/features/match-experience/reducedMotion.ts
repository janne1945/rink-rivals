import { useEffect, useState } from "react";

export interface ReducedMotionPreference {
  readonly reduced: boolean;
  readonly source: "system" | "manual";
}

export function useReducedMotionPreference(manual?: boolean): ReducedMotionPreference {
  const [systemReduced, setSystemReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return manual === undefined
    ? { reduced: systemReduced, source: "system" }
    : { reduced: manual, source: "manual" };
}
