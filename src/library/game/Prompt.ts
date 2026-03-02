import { Chit } from "./Chit";
import { IButtonLibrary } from "./Game";
import { Confirm, GameButton } from "./GameButton";
import { ButtonPick, ChitPick, Pick, PickType } from "./Pick";
import { MismatchError, Turn } from "./Turn";

type PromptType = "PickPrompt" | "NoValidMovesPrompt";

export type PromptSerialization = {
  id: string;
  type: PromptType;
  canReset: boolean;
  details: any;
};

const defaultFindChit: FindChit = () => {
  throw new Error("NOT SET");
};

type FindChit = (id: string) => Chit;

export abstract class Prompt {
  public id = "";
  public resolved = false;
  public clock = 0;
  public response: any;
  private cbs: ((success: boolean) => void)[] = [];
  public findChit: FindChit = defaultFindChit;
  public buttonLibrary: IButtonLibrary = { Confirm };

  public shouldRerun?: Turn<any, any, any>;
  public shouldStepBack = false;
  public shouldReset = false;

  public canReset = false;

  serialize(): PromptSerialization {
    return {
      id: this.id,
      type: this.type,
      canReset: this.canReset,
      details: this.serializeDetails(),
    };
  }

  deserialize(prompt: PromptSerialization) {
    this.id = prompt.id;
    this.canReset = prompt.canReset;
    this.deserializeDetails(prompt.details);
  }

  onResolve(cb: (success: boolean) => void) {
    this.cbs.push(cb);
  }

  destroy() {
    this.cbs.forEach((cb) => cb(false));
  }

  resolve(details: any) {
    this.resolved = true;
    this.resolveDetails(details);
    this.response = details;
    this.cbs.forEach((cb) => cb(true));
  }

  stepBack(fullReset: boolean = false) {
    if (!this.canReset) {
      throw new Error("Cannot be stepped back");
    }
    this.resolved = true;
    this.shouldReset = fullReset;
    this.shouldStepBack = true;
    this.cbs.forEach((cb) => cb(false));
  }

  abstract get type(): PromptType;
  abstract canResolveResponse(response: any): boolean;
  abstract serializeDetails(): any;
  abstract deserializeDetails(state: any): void;
  abstract resolveDetails(details: any): void;
  abstract stageIn(): void;
  abstract stageOut(): void;

  public get message() {
    return "Message";
  }

  public get help(): string {
    return "";
  }

  public formatHelpText() {
    return `# ${this.message}\n\n${this.help}`;
  }

  public get buttons(): GameButton[] {
    return [];
  }

  public static deserialize(prompt: PromptSerialization, findChit: FindChit, buttonLibrary: IButtonLibrary): Prompt {
    let p: Prompt | undefined = undefined;
    switch (prompt.type) {
      case "PickPrompt": {
        p = new PickPrompt();
        break;
      }
      case "NoValidMovesPrompt": {
        p = new NoValidMovesPrompt();
        break;
      }
    }

    if (p) {
      p.findChit = findChit;
      p.buttonLibrary = buttonLibrary;
      p.deserialize(prompt);
      return p;
    }

    throw new Error(`Prompt type ${prompt.type} not known`);
  }
}

export class NoValidMovesPrompt extends Prompt {
  type: PromptType = "NoValidMovesPrompt";

  _message = "No valid moves available";
  _help = "Undo and try a different action";

  get message() {
    return this._message;
  }
  set message(newMessage: string) {
    this._message = newMessage;
  }
  get help() {
    return this._help;
  }
  set help(newHelp: string) {
    this._help = newHelp;
  }

  canResolveResponse(): boolean {
    return false;
  }

  serializeDetails(): any {
    return {
      message: this._message,
      help: this._help,
    };
  }

  deserializeDetails(state: any): void {
    this._message = state.message;
    this._help = state.help;
  }

  resolveDetails() {
    throw new Error("NoValidMovesPrompt cannot be resolved");
  }

  stageIn(): void {}

  stageOut(): void {}
}

type PickResolution = { idx: number; value: any; pickType?: PickType };

export class PickPrompt extends Prompt {
  type: PromptType = "PickPrompt";

  private _message?: string;
  private _help?: string;

  public picks: Pick[] = [];
  public finished: () => void | Promise<void> = () => {};

  override get message() {
    if (this._message) {
      return this._message;
    }

    return this.picks
      .map((p) => p.messageContents)
      .filter((d) => d)
      .join(" or ");
  }

  override get help() {
    if (this._help) {
      return this._help;
    }

    return this.picks
      .map((p) => p.helpContents)
      .filter((d) => d)
      .join("\n\nor\n\n");
  }

  canResolveResponse(response: any): boolean {
    if (this.resolved) {
      return false;
    }
    if (response?.idx === undefined) {
      return false;
    }
    const pick = this.picks[response.idx];
    if (!pick) {
      return false;
    }
    if (response.pickType && response.pickType !== pick.type) {
      return false;
    }
    return pick.canResolveResponse(response.value);
  }

  async autoResolve(): Promise<boolean> {
    if (this.picks.length === 1 && this.picks[0].canAutoResolve()) {
      await this.picks[0].autoResolve();
      return true;
    }
    return false;
  }

  serializeDetails(): any {
    return {
      message: this._message,
      help: this._help,
      picks: this.picks.map((p) => p.serialize()),
    };
  }

  deserializeDetails(details: { help: string | undefined; message: string | undefined; picks: any[] }): void {
    this.picks = details.picks.map((d) => Pick.deserialize(d, this.findChit, this.buttonLibrary));
    this._message = details.message;
    this._help = details.help;
  }

  resolvePick(pick: Pick, value: any) {
    const idx = this.picks.indexOf(pick);
    this.resolve({ idx, value, pickType: pick.type });
  }

  resolveDetails(resolution: PickResolution) {
    if (resolution.idx === undefined) {
      return;
    }

    this.resolved = true;
    const pick = this.picks[resolution.idx];
    this.finished = () => pick.resolveDetails(resolution?.value);
  }

  stageIn() {
    this.picks.forEach((p) => p.stageIn(this));
  }

  stageOut() {
    this.picks.forEach((p) => p.stageOut());
  }

  setMessageAndHelp(message?: string, help?: string) {
    this._message = message;
    this._help = help;
  }

  override get buttons(): GameButton[] {
    return this.picks
      .map((p) => {
        if (p instanceof ButtonPick) {
          return p.button;
        }
        if (p instanceof ChitPick) {
          return p.button;
        }
        return undefined;
      })
      .filter((a) => a) as GameButton[];
  }
}
