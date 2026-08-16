import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";

/** Live "m:ss" countdown for the sleep timer chip (empty when off). */
export function useSleepLeft(): string {
  const sleepEnd = useStore((s) => s.sleepEnd);
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!sleepEnd) {
      setLabel("");
      return;
    }
    const update = () => {
      const left = sleepEnd - Date.now();
      if (left <= 0) setLabel("");
      else setLabel(`${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [sleepEnd]);
  return label;
}
