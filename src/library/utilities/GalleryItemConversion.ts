import { GalleryItem } from "../components/GalleryViewer";
import { Chit } from "../game/Chit";

export function chitsToGalleryItems(chits: Chit[]) {
  const result: GalleryItem[] = [];
  const resultChits: Chit[] = [];
  chits
    .map((c) => c.renderInstance)
    .forEach((instance) => {
      if (instance) {
        if (resultChits.find((chit) => instance.chit.functionallyIdentical(chit))) {
          return;
        }
        resultChits.push(instance.chit);
        result.push(instance.createGalleryItem());
      }
    });
  return result;
}
