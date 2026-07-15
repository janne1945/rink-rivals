import { Alignment, Fit, Layout, useRive } from "@rive-app/react-webgl2";

export function RiveBroadcastAsset({ assetUrl, stateMachine }: {
  readonly assetUrl: string;
  readonly stateMachine?: string;
}) {
  const { RiveComponent } = useRive({
    src: assetUrl,
    autoplay: true,
    stateMachines: stateMachine,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });
  return <RiveComponent aria-hidden="true" />;
}

