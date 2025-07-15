import { Chit } from "./Chit";
import { PlayerInfo } from "./PlayerInfo";
import { Turn } from "./Turn";
import { ParameterizedCanvas } from "../utilities/ParameterizedCanvas";
import { GameTheme } from "./GameTheme";
import { GameButton } from "./GameButton";
import { PlayerChit } from "./PlayerChit";
import { RootChit } from "./RootChit";
import { ChitRenderSpec } from "../rendering/ChitRenderSpec";

export interface IChitLibrary {
  [key: string]: new () => Chit;
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

export interface Game<P extends PlayerChit, R extends RootChit<P>> {
  get theme(): GameTheme;
  get name(): string;
  get chitLibrary(): IChitLibrary;
  get canvasLibrary(): ICanvasLibrary;
  get buttonLibrary(): IButtonLibrary;

  get galleryItemWidth(): number;
  get galleryItemSpacing(): number;

  readonly showGrid?: boolean;

  // validateConfiguration(): boolean;

  run(players: P[], setup: Turn<GameResult<P>, P, R>, rootChit: R): Promise<GameResult<P>>;
  generateRootChit(): R;
  generatePlayer(playerInfo: PlayerInfo): P;

  /**
   * Useful if you want consistent lighting and ornaments for all of your panels
   * @param spec
   */
  renderDefaultRootChit?(spec: ChitRenderSpec): void;
}
