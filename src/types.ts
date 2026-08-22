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
