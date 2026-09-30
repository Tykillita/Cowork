import { findCharacter, findLandscape } from "../ambient/sceneCatalog";
import { PixelSceneEngine } from "../ambient/pixelSceneEngine";

export async function shareStreak(current: number, characterId: string, landscapeId: string, badge?: string) {
  const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 650;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear la tarjeta.");
  const scene = document.createElement("canvas");
  const renderer = new PixelSceneEngine(scene, { character: findCharacter(characterId), landscape: findLandscape(landscapeId) });
  renderer.resize(1000, 250, 1); renderer.renderStill();
  ctx.fillStyle = "#11191e"; ctx.fillRect(0, 0, 1000, 650);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(scene, 0, 400, 1000, 250);
  ctx.fillStyle = "#8de7bd"; ctx.font = "bold 24px system-ui"; ctx.fillText("COWORK · MI RACHA", 60, 70);
  ctx.fillStyle = "#f6cf86"; ctx.font = "bold 150px monospace"; ctx.fillText(String(current), 55, 245);
  ctx.fillStyle = "#f5f5f7"; ctx.font = "32px system-ui"; ctx.fillText(current === 1 ? "día de constancia" : "días de constancia", 60, 305);
  ctx.fillStyle = "#b8c3c9"; ctx.font = "22px system-ui";
  ctx.fillText(badge || "Un día a la vez", 60, 355);
  ctx.fillStyle = "#11191ed9"; ctx.fillRect(45, 418, Math.min(500, ctx.measureText(findCharacter(characterId).name).width + 30), 42);
  ctx.fillStyle = "#f5f5f7"; ctx.fillText(findCharacter(characterId).name, 60, 448);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo crear la imagen.")), "image/png"));
  const file = new File([blob], "mi-racha-cowork.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Mi racha en Cowork" }); return; }
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = file.name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
