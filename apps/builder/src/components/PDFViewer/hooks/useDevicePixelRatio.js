/**
 * useDevicePixelRatio — reactive DPR.
 *
 * window.devicePixelRatio changes when the window moves between monitors or
 * the OS zoom changes.  The overlay canvas must re-size its backing store when
 * that happens or its strokes go blurry / misaligned.  The standard trick is a
 * matchMedia query pinned to the *current* ratio, which fires when the ratio
 * stops matching; re-subscribe after each change.
 */
import { useEffect, useState } from "react";

export default function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);

  useEffect(() => {
    let mql = null;
    let disposed = false;

    const subscribe = () => {
      if (disposed) return;
      const current = window.devicePixelRatio || 1;
      setDpr(current);
      mql = window.matchMedia(`(resolution: ${current}dppx)`);
      const onChange = () => {
        mql.removeEventListener("change", onChange);
        subscribe();
      };
      mql.addEventListener("change", onChange);
    };

    subscribe();
    return () => {
      disposed = true;
      // The last listener detaches itself on the next change; nothing else to do.
    };
  }, []);

  return dpr;
}
