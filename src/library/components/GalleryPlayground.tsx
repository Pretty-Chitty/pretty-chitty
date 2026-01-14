import React, { useEffect, useState } from "react";
import { Game } from "../game/Game";
import { Box } from "@mui/material";
import { GalleryViewer } from "./GalleryViewer";
import type { GalleryItem } from "./GalleryViewer";
import { BoxGeometry, Mesh, MeshPhongMaterial } from "three";

export class MyItem implements GalleryItem {
  constructor(
    public color: number,
    public id: string,
  ) {}

  createMesh() {
    const result = new Mesh(new BoxGeometry(50, 50, 50), new MeshPhongMaterial({ color: this.color }));
    return result;
  }

  registerUpdateHandler(cb: () => void) {
    console.log(cb);
    return () => {};
  }
}

export default function GalleryPlayground({ game }: { game: Game<any, any> }) {
  const [items, setItems] = useState(
    [...new Array(5)].map((d, i) => new MyItem(Math.random() * 0xffffff, i.toString())),
  );

  useEffect(() => {
    setTimeout(() => {
      const index = Math.floor(Math.random() * items.length);
      if (Math.random() > 0.75) {
        const item = new MyItem(Math.random() * 0xffffff, Math.random().toString());

        setItems(items.slice(0, index).concat([item]).concat(items.slice(index)));
      } else {
        setItems(items.slice(0, index).concat(items.slice(index + 1)));
      }
    }, 1000);
  }, [items]);

  return (
    <Box>
      <Box sx={{ position: "relative" }}>
        <GalleryViewer items={items} galleryItemWidth={150} itemSpacing={20} w={800} h={600} />
      </Box>
    </Box>
  );
}
