import { Composition } from "remotion";
import { DURATION, Explainer, FPS } from "./Explainer";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition id="Explainer" component={Explainer} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
  );
};
