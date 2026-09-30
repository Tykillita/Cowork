import { useEffect, useRef } from "react";
import { usePersonal } from "../personal/PersonalContext";
import { findCharacter, findLandscape } from "./sceneCatalog";
import { PixelSceneEngine } from "./pixelSceneEngine";

/** Canvas host: animates only while on screen, with the tab visible and motion allowed. */
export function SceneCanvas({ characterId, landscapeId, className = "ambientCanvas", label }: {
  characterId: string;
  landscapeId: string;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { reducedMotion } = usePersonal();
  const character = findCharacter(characterId);
  const landscape = findLandscape(landscapeId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: PixelSceneEngine;
    try { engine = new PixelSceneEngine(canvas, { character, landscape }); } catch { return; }

    let onScreen = true;
    const sync = () => {
      if (reducedMotion) { engine.renderStill(); return; }
      if (onScreen && document.visibilityState === "visible") engine.start();
      else engine.stop();
    };
    const measure = () => {
      const box = canvas.getBoundingClientRect();
      engine.resize(box.width, box.height, window.devicePixelRatio || 1);
      if (reducedMotion) engine.renderStill();
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    intersectionObserver.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    measure();
    sync();

    return () => {
      engine.stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [character, landscape, reducedMotion]);

  return <canvas ref={canvasRef} className={className} role="img" aria-label={label ?? `Escena pixel art: ${character.name.toLowerCase()} en ${landscape.name.toLowerCase()}.`} />;
}

/** Decorative scene for projects without a delivery date, using the person's own combination. */
export function AmbientScene() {
  const { scene } = usePersonal();
  const landscape = findLandscape(scene.landscapeId);
  return (
    <section className="clock ambientCard" aria-labelledby="ambient-title">
      <div className="clockHead">
        <div>
          <p className="eyebrow">SIN FECHA DE ENTREGA</p>
          <h2 id="ambient-title" className="ambientTitle">El camino sigue abierto</h2>
        </div>
        <span className="clockLabel">{landscape.name}</span>
      </div>
      <div className="ambientStage">
        <SceneCanvas characterId={scene.characterId} landscapeId={scene.landscapeId} />
      </div>
    </section>
  );
}
