import { Chit } from "../game/Chit";
import { ChitGalleryItemInstance } from "../rendering/ChitGalleryItemInstance";

export function chitsToGalleryItems(chits: Chit[]) {
  const result: ChitGalleryItemInstance[] = [];
  const resultChits: Chit[] = [];
  const dupeCounts: { [id: string]: number } = {};
  chits.forEach((chit) => {
    const dupe = resultChits.find((c) => c.functionallyIdentical(chit));
    if (dupe && dupe.id) {
      dupeCounts[dupe.id] = (dupeCounts[dupe.id] || 1) + 1;
      return;
    }
    resultChits.push(chit);
    if (chit.renderInstance?.currentGalleryItem) {
      result.push(chit.renderInstance?.currentGalleryItem);
    } else {
      result.push(new ChitGalleryItemInstance(chit));
    }
  });

  for (const [id, count] of Object.entries(dupeCounts)) {
    const dupe = result.find((item) => item.chit.id === id);
    if (dupe) {
      dupe.summary = `${count}x\n${dupe.originalSummary || ""}`;
    }
  }

  return result;
}
