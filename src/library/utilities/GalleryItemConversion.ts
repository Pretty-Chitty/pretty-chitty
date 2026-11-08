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
    const item = chit.renderInstance?.currentGalleryItem ?? new ChitGalleryItemInstance(chit);
    // a reused item may still carry the count from an earlier gallery
    item.count = undefined;
    result.push(item);
  });

  for (const [id, count] of Object.entries(dupeCounts)) {
    const dupe = result.find((item) => item.chit.id === id);
    if (dupe) {
      dupe.count = count;
    }
  }

  return result;
}
