import { DirectionalLight, Fog, FogExp2, Mesh, PerspectiveCamera, Scene, Vector3 } from "three";
import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import Hammer from "@egjs/hammerjs";
import { useWebGlRenderer } from "../hooks/useWebGlRenderer";
import { Easing, Tween } from "@tweenjs/tween.js";

let ID_COUNTER = 1;

export interface GalleryItem {
  id: string;
  createMesh(): Mesh;

  /** This takes a callback that gets updated any time the gallery item needs to be refreshed (new texture or mesh or whatnot).
   * It returns a callback that can be invoked to unsubscribe this callback
   */
  registerUpdateHandler(cb: () => void): () => void;
}

type BuiltItem = {
  item: GalleryItem;
  mesh: Mesh;
};

class GalleryController {
  constructor(
    public camera: PerspectiveCamera,
    public scene: Scene,
  ) {
    this.camera.position.z = 500;

    const light = new DirectionalLight(0xffffff, 1);
    light.position.copy(camera.position);
    scene.add(light);
  }

  private w = 100;
  private h = 100;
  private itemWidth = 100;

  private itemSpacing = 100;
  private itemsPerPage = 1;
  private frontStageWidth = 1;
  private offsetX = 0;

  private offsetAngle = Math.PI * 0.1;

  private items: BuiltItem[] = [];
  private itemLookup: { [key: string]: BuiltItem } = {};

  public setSize(w: number, h: number, itemWidth: number, itemSpacing: number) {
    this.w = w;
    this.h = h;
    this.itemWidth = Math.min(itemWidth, w - itemSpacing);
    this.itemSpacing = itemSpacing;
    this.itemsPerPage = Math.floor((w - itemSpacing * 2) / (this.itemWidth + itemSpacing));
    this.frontStageWidth = this.itemsPerPage * (this.itemWidth + itemSpacing) - itemSpacing;

    const aspect = this.camera.aspect;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(aspect * Math.tan(vFov / 2));
    this.camera.position.z = w / (2 * Math.tan(hFov / 2));
    this.camera.position.x = this.frontStageWidth / 2 - this.itemWidth / 2;

    const z = this.camera.position.z;
    this.camera.position.z = Math.cos(this.offsetAngle) * z;
    this.camera.position.y = Math.sin(this.offsetAngle) * z;
    this.camera.lookAt(new Vector3(this.camera.position.x, 0, 0));
    this.scene.fog = new Fog(0x000000, z, z + w);
  }

  render() {
    if (this.tween) {
      this.tween.update();
    }
  }

  private tween: Tween<{ x: number }> | undefined;
  pan(deltaX: number, animate = false) {
    if (this.tween) {
      this.tween.stop();
      this.tween = undefined;
    }

    if (!animate) {
      this.offsetX += deltaX;
      this.items.forEach((item, i) => this.positionItem(item, i));
    } else {
      // lock the offset to the nearest item
      let target = this.offsetX + deltaX;
      const itemIndex = Math.round(target / (this.itemWidth + this.itemSpacing));
      target = itemIndex * (this.itemWidth + this.itemSpacing);

      if (target > 0) {
        target = 0;
      }
      if (target < -(this.items.length - this.itemsPerPage) * (this.itemWidth + this.itemSpacing)) {
        target = -(this.items.length - this.itemsPerPage) * (this.itemWidth + this.itemSpacing);
      }

      const duration = 0.0001 + Math.min(750, Math.abs(target - this.offsetX) * 300);

      this.tween = new Tween({ x: this.offsetX })
        .onUpdate(({ x }) => {
          this.offsetX = x;
          this.items.forEach((item, i) => this.positionItem(item, i));
        })
        .easing(Easing.Quadratic.Out)
        .to({ x: target }, duration)
        .onComplete(() => {
          this.tween = undefined;
        })
        .start();
    }
  }

  positionItem(item: BuiltItem, index: number) {
    const mesh = item.mesh;
    mesh.position.x = index * (this.itemWidth + this.itemSpacing) + this.offsetX;

    const largestX = (this.itemsPerPage - 1) * (this.itemWidth + this.itemSpacing);
    if (mesh.position.x > largestX) {
      const overshot = mesh.position.x - largestX;
      mesh.position.x = largestX + Math.pow(overshot, 0.94);
      mesh.position.z = -overshot;
      mesh.rotation.x = -overshot / 3000 - this.offsetAngle;
    } else if (mesh.position.x < 0) {
      const overshot = Math.abs(mesh.position.x);
      mesh.position.x = -Math.pow(overshot, 0.94);
      mesh.position.z = -overshot;
      mesh.rotation.x = -overshot / 3000 - this.offsetAngle;
    } else {
      mesh.position.z = 0;
      mesh.rotation.x = -this.offsetAngle;
    }
  }

  scaleItem(item: BuiltItem) {
    const mesh = item.mesh;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (box) {
      const size = box.getSize(new Vector3());
      const scale = this.itemWidth / size.x;
      mesh.scale.set(scale, scale, scale);
    }
  }

  public setItems(items: GalleryItem[]) {
    const seenIds = new Set(Object.keys(this.itemLookup));
    items.forEach((item, i) => {
      seenIds.delete(item.id);
      if (!this.itemLookup[item.id]) {
        this.itemLookup[item.id] = { item, mesh: item.createMesh() };
        this.scaleItem(this.itemLookup[item.id]);

        // Also add your mesh to the scene:
        this.scene.add(this.itemLookup[item.id].mesh);
        this.positionItem(this.itemLookup[item.id], i);
      }
    });
    [...seenIds].forEach((id) => {
      this.itemLookup[id].mesh.parent?.remove(this.itemLookup[id].mesh);
      delete this.itemLookup[id];
    });
    this.items = Object.values(this.itemLookup);
  }
}

export function GalleryViewer({
  items,
  paused = false,
  galleryItemWidth = 200,
  itemSpacing = 50,
  w = 0,
  h = 0,
}: {
  items: GalleryItem[];
  w: number;
  h: number;
  itemSpacing: number;
  paused?: boolean;
  galleryItemWidth?: number;
}) {
  const [id] = useState(`GalleryViewer${ID_COUNTER++}`);
  const refContainer = useRef<HTMLCanvasElement>(null);
  const renderer = useWebGlRenderer(w, h);
  const [galleryController] = useState(
    new GalleryController(new PerspectiveCamera(50, w / h, 0.1, 20000), new Scene()),
  );

  useEffect(() => {
    galleryController.setSize(w, h, galleryItemWidth, itemSpacing);
  }, [galleryItemWidth, itemSpacing, w, h, galleryController]);

  useEffect(() => {
    galleryController.setItems(items);
  }, [items, galleryController]);

  // const [panOffset, setPanOffset] = useState(0);

  // useEffect(() => {
  //   if (!items || !renderer || !camera) return;
  //   scene.clear();

  //   const light = new DirectionalLight(0xffffff, 1);
  //   light.position.copy(camera.position);
  //   scene.add(light);

  //   items.forEach((item, i) => {
  //     const mesh = item.createMesh();
  //     mesh.geometry.computeBoundingBox();
  //     const box = mesh.geometry.boundingBox;
  //     if (box) {
  //       const size = box.getSize(new Vector3());
  //       const scale = galleryItemWidth / size.x;
  //       mesh.scale.set(scale, scale, scale);
  //     }
  //     mesh.position.x = i * (galleryItemWidth + 20) + panOffset;
  //     const half = (items.length - 1) / 2;
  //     const dist = Math.abs(i - half) / half;
  //     mesh.position.z = 0; //-dist * 300;
  //     scene.add(mesh);
  //   });
  // }, [items, scene, panOffset, renderer, galleryItemWidth, camera]);

  useEffect(() => {
    const canvas = refContainer.current;
    if (!canvas || !renderer || paused) return;
    const ctx = canvas.getContext("2d");
    let cancelled = false;
    const animate = () => {
      if (cancelled) return;
      requestAnimationFrame(animate);
      galleryController.render();
      renderer.setClearColor(0x000000, 0);

      renderer.render(galleryController.scene, galleryController.camera);
      if (ctx) {
        ctx.clearRect(0, 0, w * window.devicePixelRatio, h * window.devicePixelRatio);
        ctx.drawImage(renderer.domElement, 0, 0, w * window.devicePixelRatio, h * window.devicePixelRatio);
      }
    };
    animate();
    return () => {
      cancelled = true;
    };
  }, [id, renderer, galleryController, paused, w, h]);

  useEffect(() => {
    const el = refContainer.current;
    if (!el) return;
    const hammer = new Hammer.Manager(el);
    hammer.add(new Hammer.Pan({ direction: Hammer.DIRECTION_HORIZONTAL }));

    let lastX: number | undefined = undefined;
    let lastVelocityX = 0;
    hammer.on("pan", (ev) => {
      if (lastX === undefined) {
        lastX = 0;
      } else {
        lastVelocityX = ev.velocityX;
        galleryController.pan(-(lastX - ev.deltaX));
        lastX = ev.deltaX;
      }
      ev.preventDefault();
    });
    hammer.on("panend", () => {
      lastX = undefined;
      galleryController.pan(lastVelocityX * 300, true);
      lastVelocityX = 0;
    });
    return () => {
      hammer.destroy();
    };
  }, [galleryController]);

  return (
    <Box sx={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}>
      <canvas
        width={w * window.devicePixelRatio}
        height={h * window.devicePixelRatio}
        style={{ width: w, height: h }}
        ref={refContainer}
      />
    </Box>
  );
}
