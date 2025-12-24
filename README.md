# Pretty Chitty

Pretty Chitty is a pretty & chitty board game platform. It's a typescript framework that makes it quick and easy to build high quality async or realtime 3d strategy games.

## Overview

Pretty Chitty provides a comprehensive game engine that combines:

- **3D Rendering**: ThreeJS-based 3D visualization of game pieces (chits) with customizable lighting, cameras, and animations
- **2D Canvas System**: React-based canvas rendering for textures
- **Game State Management**: Turn-based game logic with player interaction and state management
- **UI Components**: UI Playground with hot reloading makes UI changes a breeze
- **Real-time Multiplayer**: Client-server architecture with connection management and state synchronization

## Live Demos

Check out these example games built with Pretty Chitty:

- **[Demo Game 1](https://link-to-demo-1)** - Description
- **[Demo Game 2](https://link-to-demo-2)** - Description

Source code for demos:

- [Demo 1 Repository](https://github.com/...)
- [Demo 2 Repository](https://github.com/...)

## Documentation

Full API documentation is available at: **[https://pretty-chitty.github.io/pretty-chitty/](https://pretty-chitty.github.io/pretty-chitty/)**

Or view locally after building:

```bash
yarn docs
open docs/index.html
```

## Core Concepts

### Chits

Chits are the fundamental game pieces in Pretty Chitty. Everything is a chit - cards, dice, tokens, players, even the game board itself. A `Chit` is a normal typescript class and can have any basic serializable properties on it (including references to other chits). The game state is effectively a tree, where every `Chit` (except the "root" chit) has a `parent`, a `parentOutlet` (i.e. how is this chit related to its parent), and possibly a `parentOutletIndex` (i.e. this is the third token in a stack on a card).

Key chit types:

- **`Chit`**: Base class for all game pieces
- **`RootChit`**: The game board/table that contains all other chits
- **`PlayerChit`**: Represents individual players with their own state
- **`GameDeckChit`**: Deck of cards with shuffle, draw, and staging
- **`GameBagChit`**: Bag of pieces for random drawing
- **`DiceChit`**: Animated dice with customizable faces
- **`SparkChit`**: Interactive UI elements in panels

### Outlets

Chits can have named outlets (using the `@ChildOutlet` decorator) where other chits can be placed. The `OrderedOutlet` class manages ordered collections of chits with support for splaying, stacking, and positioning.

### Turn System

Games are structured around the `Turn` class, which provides:

- Asynchronous game flow control
- Player picking (choosing chits or buttons)
- State management and history
- Undo/redo support

### Rendering

**3D Rendering** via `ChitRenderSpec`:

- Custom geometries and materials
- Camera positioning with `CameraSpec`
- Lighting with `LightSpec`
- Highlights and outlines
- Splay configurations for card fans

**2D Rendering** via `ReactCanvas`:

- Declarative JSX-like syntax for canvas layouts
- Text, images, colors, and shapes
- Responsive layout system
- Icon support with customizable icon maps

## Installation

While this is an npm package, it is _highly_ recommended that you use the `@pretty-chitty/cli` package to install and run Pretty Chitty games. This cli utility will:

- Initialize new games from a boilerplate
- Run a hot-reloading playground for local development
- Create and optimize spritemaps for fast loads
- Build and upload to CDNs

## Basic Usage

### Define Your Game

```typescript
import { Game, PlayerChit, RootChit, Turn, GameResult, GameTheme } from "@pretty-chitty/core";

class MyPlayerChit extends PlayerChit {
  // Player-specific state
}

class MyRootChit extends RootChit<MyPlayerChit> {
  // Game board state
}

class MyGame implements Game<MyPlayerChit, MyRootChit> {
  get theme() {
    return new GameTheme();
  }
  get name() {
    return "My Game";
  }

  get chitLibrary() {
    return {
      Player: MyPlayerChit,
      Root: MyRootChit,
      // ... other chit types
    };
  }

  get canvasLibrary() {
    return {};
  }
  get buttonLibrary() {
    return {};
  }

  async run(setup: Turn<GameResult<MyPlayerChit>, MyPlayerChit, MyRootChit>, root: MyRootChit) {
    // Game logic goes here
    return { winners: [] };
  }
}
```

### Render Chits

```typescript
import { ChitRenderSpec } from '@pretty-chitty/core';
import * as ReactCanvas from '@pretty-chitty/core/ReactCanvas';

class MyCardChit extends Chit {
  render(spec: ChitRenderSpec) {
    spec.geometry = new BoxGeometry(2, 3, 0.1);
    spec.material = new MeshStandardMaterial({ color: 0xffffff });

    spec.canvas = () => (
      <ReactCanvas.Vertical>
        <ReactCanvas.Text text="My Card" fontSize={24} />
        <ReactCanvas.Image src="/card-art.png" />
      </ReactCanvas.Vertical>
    );
  }
}
```

### Display a Match

```typescript
import { MatchViewer } from '@pretty-chitty/core';

function App() {
  return <MatchViewer game={new MyGame()} />;
}
```

## Development

### Build

```bash
yarn build
```

### Run Development Server

```bash
yarn dev
```

### Run Tests

```bash
yarn test
```

### Type Checking

```bash
yarn compile:check
```

## Key Features

- **Decorator-based annotations** for defining chit outlets and properties
- **Automatic state serialization** with support for hidden properties per player
- **Hot reload support** in development mode
- **Game designer UI** for testing and debugging
- **Customizable themes** with player colors and avatars
- **Panel system** for showing detailed chit information
- **Gallery view** for browsing game pieces
- **Time travel debugging** with match replay

## License

This project is licensed under the Pretty Chitty Source-Available License v1.0.

**Allowed Uses:**

- Personal, educational, or hobby projects
- Free digital games
- Supporting physical board game sales

**Not Allowed Without Permission:**

- Commercial redistribution
- Selling or monetizing the software
- Publishing modified versions publicly

For commercial licensing: legal@prettychitty.com

See [LICENSE.md](./LICENSE.md) for full details.

## Contributing

This is a source-available project. Public redistribution and derivative works are not permitted under the license. For contribution opportunities or commercial partnerships, please contact legal@prettychitty.com.
