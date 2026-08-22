export type AspectRatio = "9:16" | "16:9";

export type Script = {
  topic: string;
  hook: string;
  beats: string[];
  cta: string;
};

export type ProduceOptions = {
  topic: string;
  outDir?: string;
  aspect?: AspectRatio;
};

export type TtsEngine = "edge-tts" | "piper" | "espeak-ng";

export type WordTiming = {
  text: string;
  start: number;
  end: number;
};

export type SceneMotif =
  | "slash"
  | "ring"
  | "bars"
  | "rise"
  | "stack"
  | "lane"
  | "pulse"
  | "frame";

export type GradientKind = "linear" | "radial" | "circular" | "spiral";

export type VisualScene = {
  index: number;
  label: string;
  part: "hook" | "beat" | "cta";
  start: number;
  end: number;
  bg0: string;
  bg1: string;
  accent: string;
  motif: SceneMotif;
  gradient: GradientKind;
  punch: "in" | "left" | "right" | "up";
};

export type ArtifactPaths = {
  script: string;
  audio: string;
  video: string;
  captions: string;
  scenes: string;
};
