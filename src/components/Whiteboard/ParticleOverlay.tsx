"use client";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  angle: number;
  distance: number;
  size: number;
}

interface ParticleOverlayProps {
  particles: Particle[];
  onParticlesEnd: (ids: number[]) => void;
}

const PARTICLE_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#6366f1",
  "#a855f7", "#ec4899", "#14b8a6", "#06b6d4",
];

export function ParticleOverlay({ particles, onParticlesEnd }: ParticleOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 50 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-particle-burst"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: "translate(-50%, -50%)",
            "--dx": `${Math.cos(p.angle) * p.distance}px`,
            "--dy": `${Math.sin(p.angle) * p.distance}px`,
          } as React.CSSProperties}
          onAnimationEnd={() => onParticlesEnd([p.id])}
        />
      ))}
      <style>{`
        @keyframes particle-burst {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(
              calc(-50% + var(--dx)),
              calc(-50% + var(--dy))
            ) scale(0);
          }
        }
        .animate-particle-burst {
          animation: particle-burst 600ms ease-out forwards;
        }
      `}</style>
    </div>
  );
}

// Utility to create particles at a given position
export function createEraseParticles(
  x: number,
  y: number,
  nextId: () => number,
  count: number = 8
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 30 + Math.random() * 50;
    const size = 3 + Math.random() * 5;
    const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    particles.push({
      id: nextId(),
      x,
      y,
      color,
      angle,
      distance,
      size,
    });
  }
  return particles;
}
