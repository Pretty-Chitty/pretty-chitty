import { Game } from "./Game";

export interface IMatchInformation {
  get game(): Game<any, any>;
}
