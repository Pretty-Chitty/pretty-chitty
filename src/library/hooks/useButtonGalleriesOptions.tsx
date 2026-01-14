import useLocalStorageState from "use-local-storage-state";

type GalleryDisplayMode = "inline" | "modal";

export function useButtonGalleriesOptions() {
  return useLocalStorageState<GalleryDisplayMode>("galleryFullScreen", {
    defaultValue: "inline",
  });
}
