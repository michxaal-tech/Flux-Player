export const cleanName = (n: string) => n.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();

export const fmt = (t: number) => {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const isAudioFile = (f: File) =>
  f.type.startsWith("audio/") || /\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(f.name);
