import React, { useMemo, useEffect, useState, useRef } from "react";

import ObjectWithPropsEditor from "./ObjectWithPropsEditor";
import StageAndEditor from "./StageAndEditor";
import SelectableItemAndStage from "./SelectableItemAndStage";
import { Chit } from "../game/Chit";
import Viewer from "./Viewer";
import { Box, Checkbox, FormControlLabel, MenuItem, Select, Stack, Typography } from "@mui/material";
import { BaseTable } from "../utilities/BaseTable";
import { ChitRenderSpec } from "../rendering/ChitRenderSpec";
import useLocalStorageState from "use-local-storage-state";
import { useTimeState } from "../hooks/useTimeController";
import useSize from "@react-hook/size";

export interface IChitLibrary {
  [key: string]: new () => Chit;
}

function ResizingViewer({ wireframes, chit }: { wireframes: boolean; chit: Chit }) {
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  return (
    <Box sx={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0, overflow: "hidden" }} ref={ref}>
      <Viewer w={width} h={height} wireframes={wireframes} chit={chit} />
    </Box>
  );
}

function Editor({
  wireframes = false,
  ClassDef,
  ParentClassDef,
}: {
  wireframes: boolean;
  ClassDef: new () => Chit;
  ParentClassDef?: new () => Chit;
}) {
  const timeState = useTimeState();
  const [instance, setInstance] = useState<Chit | undefined>();
  const [parentInstance, setParentInstance] = useState<Chit | undefined>();
  const [rootInstance, setRootInstance] = useState<Chit | undefined>();

  useEffect(() => {
    if (!ClassDef) {
      setInstance(undefined);
      return;
    }

    const newInstance = new ClassDef();
    setInstance(newInstance);
    return () => newInstance.removeFromParent();
  }, [ClassDef]);

  useEffect(() => {
    if (ParentClassDef) {
      const newInstance = new ParentClassDef();
      setParentInstance(newInstance);
      return () => newInstance.removeFromParent();
    } else {
      setParentInstance(undefined);
    }
  }, [ParentClassDef]);

  const BT = BaseTable;
  useEffect(() => {
    let needsToHaveStageCreated = true;

    if (!instance) {
      return;
    }

    try {
      timeState.animationSpeedMultiplier.value = 1;
      setTimeout(() => rootInstance?.renderInstance?.tweenGroup?.update(Number.MAX_SAFE_INTEGER), 10);

      const instanceRenderResult = new ChitRenderSpec(instance);
      instance.render(instanceRenderResult);
      parentInstance?.add(instance);
      if (instanceRenderResult.camera || instanceRenderResult.lightSpec) {
        needsToHaveStageCreated = false;
      }

      if (parentInstance) {
        needsToHaveStageCreated = true;
        const parentRenderResult = new ChitRenderSpec(parentInstance);
        parentInstance.render(parentRenderResult);
        if (parentRenderResult.camera || parentRenderResult.lightSpec) {
          needsToHaveStageCreated = false;
        }
      }

      if (needsToHaveStageCreated) {
        if (!(rootInstance instanceof BT)) {
          const stage = new BT();
          stage.add(parentInstance ?? instance);
          stage.target = instance;
          stage.parentTarget = parentInstance;
          setRootInstance(stage);
        } else {
          rootInstance.add(parentInstance ?? instance);
          rootInstance.target = instance;
          rootInstance.parentTarget = parentInstance;
          rootInstance.notifyChange("target");
          rootInstance.notifyChange("parentTarget");
        }
      } else {
        setRootInstance(parentInstance ?? instance);
      }
    } catch (e) {
      console.error(e);
    }
  }, [timeState, instance, parentInstance, rootInstance, BT]);

  return (
    <StageAndEditor editor={rootInstance && <ObjectWithPropsEditor obj={rootInstance} />}>
      {rootInstance && <ResizingViewer wireframes={wireframes} chit={rootInstance} />}
    </StageAndEditor>
  );
}

export default function ChitLibraryViewer({ library }: { library: IChitLibrary }) {
  const items = useMemo(() => Object.keys(library), [library]);
  const [parentType, setParentType] = useLocalStorageState<string>("chitLibraryParentType", {
    defaultValue: "",
  });
  const [wireframes, setWireframes] = useLocalStorageState<boolean>("showBoundingBoxes", { defaultValue: false });

  return (
    <SelectableItemAndStage
      keySpace="chitLibrary"
      topOptions={
        <Stack direction="row">
          <Typography sx={{ ml: 4, lineHeight: 4 }}>Parent:</Typography>
          <Select
            variant="standard"
            sx={{ m: 2, width: 200 }}
            value={parentType}
            label="Select Choice"
            onChange={(e) => setParentType(e.target.value ?? undefined)}
          >
            <MenuItem value={""}>(none)</MenuItem>
            {items.map((item) => (
              <MenuItem value={item} key={item}>
                {item}
              </MenuItem>
            ))}
          </Select>
          <FormControlLabel
            control={<Checkbox checked={wireframes} onChange={(e) => setWireframes(e.target.checked)} />}
            label={"Bounding Boxes"}
          />
        </Stack>
      }
      items={items}
      render={(item) => (
        <Editor
          wireframes={wireframes}
          ParentClassDef={parentType ? library[parentType] : undefined}
          ClassDef={library[item]}
        />
      )}
    />
  );
}
