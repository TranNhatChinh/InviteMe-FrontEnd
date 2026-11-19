import type { CSSProperties } from "react";
import type { ParticleEffect } from "./particle-settings";
import styles from "./falling-particles.module.css";

export function FallingParticles({ effect }: { effect: ParticleEffect }) {
  if (effect === "none") return null;
  return (
    <div
      className={`inviteme-guest-decoration inviteme-guest-decoration--fixed ${styles.particles}`}
      data-effect="petals"
      data-intensity="vivid"
      data-falling-effect={effect}
      aria-hidden="true"
    >
      {Array.from({ length: 20 }, (_, index) => (
        <span
          key={index}
          className={`inviteme-guest-decoration__particle ${styles.particle}`}
          data-symbol={effect === "happiness" ? "囍" : effect === "leaves" ? "❧" : "♥"}
          style={
            {
              "--particle-x": `${(index * 37 + 11) % 100}%`,
              "--particle-y": `${(index * 29 + 7) % 88}%`,
              "--particle-delay": `${-((index * 1.13) % 8)}s`,
              "--particle-duration": `${13 + (index % 7) * 1.8}s`,
              "--particle-drift": `${((index * 19) % 120) - 60}px`,
              "--particle-scale": `${0.7 + (index % 4) * 0.16}`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
