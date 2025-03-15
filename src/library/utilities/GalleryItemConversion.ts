import { GalleryItem } from "../components/GalleryViewer";
import { Chit } from "../game/Chit";
import { ChitGalleryItemInstance } from "../rendering/ChitGalleryItemInstance";

export function chitsToGalleryItems(chits: Chit[]) {
  const result: GalleryItem[] = [];
  const resultChits: Chit[] = [];
  chits.forEach((chit) => {
    if (resultChits.find((c) => c.functionallyIdentical(chit))) {
      return;
    }
    resultChits.push(chit);
    if (chit.renderInstance?.currentGalleryItem) {
      result.push(chit.renderInstance?.currentGalleryItem);
    } else {
      result.push(new ChitGalleryItemInstance(chit));
    }
  });
  return result;
}
