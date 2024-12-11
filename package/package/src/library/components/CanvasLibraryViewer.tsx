import React, { useMemo, useEffect, useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup } from '@mui/material';
import {
  FormatColorFill,
  PhotoSizeSelectSmall,
  PhotoSizeSelectActual,
  PhotoSizeSelectLarge,
  GridOn,
  GridOff,
} from '@mui/icons-material';
import useLocalStorageState from 'use-local-storage-state';

import UpdatingCanvasViewer, { Size } from './UpdatingCanvasViewer';
import ObjectWithPropsEditor from './ObjectWithPropsEditor';
import { ParameterizedCanvas } from '../utilities/ParameterizedCanvas';
import { IUpdatingCanvas } from '../utilities/IUpdatingCanvas';
import StageAndEditor from './StageAndEditor';
import SelectableItemAndStage from './SelectableItemAndStage';

export interface ICanvasLibrary {
  [key: string]: new () => ParameterizedCanvas;
}

function Editor({ size, ClassDef }: { size: Size; ClassDef: new () => ParameterizedCanvas }) {
  const instance = useMemo(() => ClassDef && new ClassDef(), [ClassDef]);
  const [canvas, setCanvas] = useState<IUpdatingCanvas | null>(null);

  useEffect(() => {
    if (!instance) {
      return;
    }

    setCanvas(instance.get());
    return instance.onChange(null, () => setCanvas(instance.get()));
  }, [instance]);

  return (
    <StageAndEditor editor={<ObjectWithPropsEditor obj={instance} />}>
      <Box sx={{ p: 3 }}>{canvas && <UpdatingCanvasViewer size={size} updatingCanvas={instance.get()} />}</Box>
    </StageAndEditor>
  );
}

export default function CanvasLibraryViewer({ library }: { library: ICanvasLibrary }) {
  const items = useMemo(() => Object.keys(library), [library]);
  const [selectedSize, setSelectedSize] = useLocalStorageState<Size>('canvasLibrarySize', {
    defaultValue: 'actual',
  });

  return (
    <SelectableItemAndStage
      keySpace="canvasLibrary"
      topOptions={
        <ToggleButtonGroup
          exclusive
          size="small"
          sx={{ m: 2 }}
          value={selectedSize}
          onChange={(_e, newValue) => setSelectedSize(newValue)}
        >
          <ToggleButton value="actual">
            <PhotoSizeSelectActual />
          </ToggleButton>
          <ToggleButton value="fill">
            <FormatColorFill />
          </ToggleButton>
          <ToggleButton value="small">
            <PhotoSizeSelectSmall />
          </ToggleButton>
          <ToggleButton value="large">
            <PhotoSizeSelectLarge />
          </ToggleButton>
          <ToggleButton value="tile">
            <GridOn />
          </ToggleButton>
          <ToggleButton value="small_tile">
            <GridOff />
          </ToggleButton>
        </ToggleButtonGroup>
      }
      items={items}
      render={(item) => <Editor size={selectedSize} ClassDef={library[item]} />}
    />
  );
}
