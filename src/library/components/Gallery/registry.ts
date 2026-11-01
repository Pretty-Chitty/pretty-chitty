import { Chit } from "../../game/Chit";

/** Which gallery: the strip above the log, the full-screen one, or the small one in the prompt bar */
export type GalleryKind = "inline" | "fullscreen" | "context";

/** A page-space rectangle (CSS px, like getBoundingClientRect) */
export type GalleryRect = { left: number; top: number; right: number; bottom: number };

/**
 * An open gallery, as the tutorial overlay sees it: where a chit's item is on screen, and how to bring
 * an item into view. Registered by `GalleryViewer` when given a `kind`.
 */
export interface RegisteredGallery {
  kind: GalleryKind;
  /** The gallery's canvas, used to tell which viewer (and so which player) the gallery belongs to */
  element: HTMLElement;
  /**
   * Where the item showing this chit is: a rect when it is on screen, "offscreen" when the gallery has
   * the item but it is scrolled out of view, undefined when the gallery does not show it.
   */
  locate(chit: Chit): GalleryRect | "offscreen" | undefined;
  /** Scrolls the gallery so the item showing this chit is in view */
  scrollTo(chit: Chit): void;
  /** Ids of the chits whose items the gallery shows */
  chitIds(): string[];
}

const galleries = new Set<RegisteredGallery>();

export const galleryRegistry = {
  register(gallery: RegisteredGallery) {
    galleries.add(gallery);
    return () => {
      galleries.delete(gallery);
    };
  },
  /** Open galleries inside `scope` (a viewer's root element), full-screen first, then inline, then context */
  list(scope?: ParentNode | null): RegisteredGallery[] {
    const order: GalleryKind[] = ["fullscreen", "inline", "context"];
    return [...galleries]
      .filter((g) => !scope || (scope as Node).contains(g.element))
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  },
};
