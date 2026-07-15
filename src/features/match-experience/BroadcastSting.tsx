import { lazy, Suspense } from "react";

import styles from "./MatchExperienceV2.module.css";

const LazyRiveBroadcastAsset = lazy(async () => {
  const module = await import("./RiveBroadcastAsset");
  return { default: module.RiveBroadcastAsset };
});

function StaticFinalShift() {
  return (
    <div className={styles.finalShiftFallback} data-rive-fallback="true" aria-hidden="true">
      <span /><span /><span />
    </div>
  );
}

export function BroadcastSting({ assetUrl, reducedMotion }: {
  readonly assetUrl?: string;
  readonly reducedMotion: boolean;
}) {
  if (!assetUrl || reducedMotion) return <StaticFinalShift />;
  return (
    <Suspense fallback={<StaticFinalShift />}>
      <LazyRiveBroadcastAsset assetUrl={assetUrl} />
    </Suspense>
  );
}

