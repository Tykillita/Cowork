import { initials } from "../features/milestones/milestoneModel";
import { SkImg } from "./Skeleton";

export function Avatar({ name, photoURL = "", size = 22, muted = false }: { name: string; photoURL?: string; size?: number; muted?: boolean }) {
  return (
    <span className={`avatar${muted ? " isMuted" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {photoURL ? <SkImg src={photoURL} alt="" referrerPolicy="no-referrer" /> : initials(name)}
    </span>
  );
}
