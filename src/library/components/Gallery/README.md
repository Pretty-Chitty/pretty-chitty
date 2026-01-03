# Gallery Component

A modular 3D gallery viewer component for displaying items in an interactive carousel-style interface.

## Architecture

The Gallery component has been refactored into separate, focused modules for better maintainability:

### Core Files

- **`GalleryViewer.tsx`** - Main React component that orchestrates everything
- **`GalleryController.ts`** - Main controller that coordinates all managers
- **`index.ts`** - Public exports for the module

### Manager Classes

Each manager handles a specific concern:

- **`CameraManager.ts`** - Camera and lighting setup/control
  - Manages PerspectiveCamera positioning
  - Controls directional and ambient lighting
  - Handles FOV and fog configuration

- **`ItemManager.ts`** - Gallery item lifecycle management
  - Adds/removes/updates gallery items
  - Handles item scaling and mesh creation
  - Manages enter/exit animations for items

- **`LayoutManager.ts`** - Layout calculations and dimensions
  - Calculates item positioning and spacing
  - Manages viewport dimensions
  - Handles aspect ratio constraints

- **`AnimationController.ts`** - Animation and positioning logic
  - Pan animations and tweening
  - Item positioning with overshoot effects
  - Smooth transitions between states

- **`SummaryRenderer.ts`** - Text summary rendering
  - Creates summary text meshes
  - Handles full/partial/none display modes
  - Manages summary positioning

### Supporting Files

- **`types.ts`** - TypeScript interfaces and types
  - `GalleryItem` - Individual gallery item interface
  - `GalleryItemSource` - Collection of gallery items
  - `BuiltItem` - Internal item representation
  - `GallerySizeConfig` - Size configuration
  - `SummaryMode` - Display mode for summaries

- **`constants.ts`** - Configuration constants
  - Scale factors
  - Animation durations
  - Default values

## Usage

```typescript
import { GalleryViewer } from './components/Gallery';
import type { GalleryItem } from './components/Gallery';

const items: GalleryItem[] = [...];

<GalleryViewer
  items={items}
  w={800}
  h={600}
  galleryItemWidth={200}
  galleryItemHeight={400}
  itemSpacing={50}
  showSummary="full"
  onClose={() => console.log('closed')}
/>
```

## Backward Compatibility

The original `GalleryViewer.tsx` file in the parent directory now re-exports from this module, ensuring backward compatibility with existing code.

## Key Improvements

1. **Separation of Concerns** - Each class has a single, well-defined responsibility
2. **Named Constants** - Magic numbers replaced with descriptive constants
3. **Better Naming** - `meshToShowOrHideIfCentered` → `summaryMesh`
4. **Type Safety** - Proper TypeScript types throughout
5. **Error Handling** - Guards for edge cases like empty arrays
6. **Testability** - Smaller, focused classes are easier to unit test
7. **Maintainability** - Easier to locate and modify specific functionality
