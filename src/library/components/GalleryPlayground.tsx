import React, { useState } from "react";
import { Game } from "../game/Game";
import { Box } from "@mui/material";
import { GalleryViewer } from "./GalleryViewer";
import type { GalleryItem } from "./GalleryViewer";
import { BoxGeometry, Mesh, MeshPhongMaterial, SphereGeometry } from "three";

class MyItem implements GalleryItem {
  constructor(public id: string) {}
  createMesh() {
    const result = new Mesh(new BoxGeometry(50, 50, 50), new MeshPhongMaterial({ color: 0xff0000 }));
    return result;
  }

  registerUpdateHandler(cb: () => void) {
    return () => {};
  }
}

export default function GalleryPlayground({ game }: { game: Game<any, any> }) {
  const [items] = useState([...new Array(20)].map((d, i) => new MyItem(i)));
  return (
    <Box>
      <Box sx={{ position: "relative" }}>
        <GalleryViewer items={items} galleryItemWidth={120} itemSpacing={20} w={340} h={600} />
      </Box>
    </Box>
  );
}
