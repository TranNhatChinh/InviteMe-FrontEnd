export const particleEffects = ["none", "hearts", "leaves", "happiness"] as const;
export type ParticleEffect = (typeof particleEffects)[number];

export function resolveParticles(
  props: {
    particles?: ParticleEffect;
    cover?: { particles?: ParticleEffect; enabled?: boolean };
  } = {},
): ParticleEffect {
  return props.particles ?? props.cover?.particles ?? (props.cover?.enabled ? "hearts" : "none");
}
