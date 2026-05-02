import { Chit } from "./Chit";
import { Turn } from "./Turn";
import { ParameterizedCanvas } from "../utilities/ParameterizedCanvas";
import { GameTheme } from "./GameTheme";
import { GameButton } from "./GameButton";
import { PlayerChit } from "./PlayerChit";
import { RootChit } from "./RootChit";
import { ChitRenderSpec } from "../rendering/ChitRenderSpec";
import { TokenDefinition } from "../components/TokenizedMessage";
import { GameMetaData } from "./GameMetaData";

export interface IChitLibrary<P extends PlayerChit, R extends RootChit<P>> {
  [key: string]: new () => Chit;
  Player: new () => P;
  Root: new () => R;
}

export interface ICanvasLibrary {
  [key: string]: new () => ParameterizedCanvas;
}

export interface IButtonLibrary {
  [key: string]: new () => GameButton;
}

export type GameResult<P extends PlayerChit> = {
  winners: P[];
};

/**
 * Core entry point for a pretty-chitty game.  This needs to ultimately provide:
 * - A way to generate players
 * - A way to generate the root chit
 * - An async `run` method to actually execute the game logic
 * - A library of chits, buttons and canvases
 *
 * See documentation on {@link Turn} for more details on how to structure your game logic.
 *
 * @group Core Game Elements
 */
export interface Game<P extends PlayerChit, R extends RootChit<P>> {
  get theme(): GameTheme;
  get chitLibrary(): IChitLibrary<P, R>;
  get canvasLibrary(): ICanvasLibrary;
  get buttonLibrary(): IButtonLibrary;
  get metadata(): GameMetaData;

  tokenMap?: { [key: string]: TokenDefinition };

  run(setup: Turn<GameResult<P>, P, R>, rootChit: R): Promise<GameResult<P>>;

  /**
   * Useful if you want consistent lighting and ornaments for all of your panels
   * @param spec
   */
  renderDefaultRootChit?(spec: ChitRenderSpec): void;

  /**
   * Useful to help the bad AI demo pick more interesting picks.  This function should return a multiplier for the weight of a given pick, where the weight is determined by the type of pick (e.g. ButtonPick is 1, ChitPick is the number of chits that can be picked, DragPick is the number of targets that can be dragged to).  The picks parameter is the full list of picks available, and the pick parameter is the specific pick we are calculating the weight for.
   * @param picks The list of available pickes
   * @param pick the pick we are looking at
   */
  demoPickWeight?(picks: any[], pick: any): number;
}
