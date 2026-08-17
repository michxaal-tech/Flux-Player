export const cleanName = (n: string) => n.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();

export const fmt = (t: number) => {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** iOS often hands over files with an empty or wrong MIME type, so the
 * extension is the more reliable signal of the two. */
export const isAudioFile = (f: File) =>
  f.type.startsWith("audio/") ||
  f.type === "application/ogg" ||
  /\.(mp3|wav|wave|flac|ogg|oga|opus|m4a|m4b|mp4|aac|aif|aiff|aifc|caf|wma|alac|3gp|amr|mka)$/i.test(f.name);
