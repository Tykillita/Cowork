import { createRoot } from "react-dom/client";
import { PersonalProvider, usePersonal } from "../../src/features/personal/PersonalContext";
import { PixelFlame } from "../../src/features/streaks/PixelFlame";
import { SceneCanvas } from "../../src/features/ambient/AmbientScene";
import CardSwap, { Card } from "../../src/components/ui/CardSwap";
import ScrambledText from "../../src/components/ui/ScrambledText";
import CardNav, { type CardNavItem } from "../../src/components/CardNav";
import "../../src/features/streaks/streaks.css";
import "../../src/styles/card-nav.css";

const menuItems: CardNavItem[] = ["Espacio", "Equipo", "Cuenta"].map((label) => ({
  label, bgColor: "#25292c", textColor: "#fff", links: [{ label: "Abrir", href: "#fixture", ariaLabel: `Abrir ${label}` }],
}));

function MotionMenu() {
  const { reducedMotion } = usePersonal();
  return <div className="fixtureMenu" style={{ position: "relative", height: 310 }}>
    <CardNav logo="/cowork-card-nav-logo.svg" items={menuItems} reducedMotion={reducedMotion} />
  </div>;
}

createRoot(document.getElementById("root")!).render(
  <PersonalProvider user={null}>
    <PixelFlame state="lit" motion="idle" small />
    <h1><ScrambledText>Movimiento legible</ScrambledText></h1>
    <div style={{ position: "relative", width: 320, height: 160 }}>
      <SceneCanvas characterId="farolero" landscapeId="valle-nocturno" className="fixtureCanvas" />
    </div>
    <div className="fixtureCards" style={{ position: "relative", width: 320, height: 240 }}>
      <CardSwap width={180} height={120} cardDistance={30} verticalDistance={25} delay={1200} easing="linear">
        <Card>Primera tarjeta</Card><Card>Segunda tarjeta</Card><Card>Tercera tarjeta</Card>
      </CardSwap>
    </div>
    <MotionMenu />
  </PersonalProvider>,
);
