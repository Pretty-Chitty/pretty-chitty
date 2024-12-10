import { Chit } from './Chit';
import { IButtonLibrary } from './Game';
import { Confirm, GameButton } from './GameButton';
import { ButtonPick, Pick } from './Pick';
import { MismatchError, Turn } from './Turn';

type PromptType = 'SelectPrompt' | 'ConfirmPrompt' | 'PickPrompt';

export type PromptSerialization = {
  type: PromptType;
  canReset: boolean;
  details: any;
};

const defaultFindChit: FindChit = () => {
  throw new Error('NOT SET');
};

type FindChit = (id: string) => Chit;

export abstract class Prompt {
  public id = '';
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
      type: this.type,
      canReset: this.canReset,
      details: this.serializeDetails(),
    };
  }

  deserialize(prompt: PromptSerialization) {
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
      throw new Error('Cannot be stepped back');
    }
    this.resolved = true;
    this.shouldReset = fullReset;
    this.shouldStepBack = true;
    this.cbs.forEach((cb) => cb(false));
  }

  abstract get type(): PromptType;
  abstract serializeDetails(): any;
  abstract deserializeDetails(state: any): void;
  abstract resolveDetails(details: any): void;
  abstract stageIn(): void;
  abstract stageOut(): void;

  public get message() {
    return 'Message';
  }

  public get help(): string {
    return '';
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
      case 'SelectPrompt': {
        p = new SelectPrompt();
        break;
      }
      case 'PickPrompt': {
        p = new PickPrompt();
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

export class SelectPrompt extends Prompt {
  type: PromptType = 'SelectPrompt';

  public chits: Chit[] = [];
  public selectedChit: Chit | undefined;

  serializeDetails(): any {
    return this.chits.map((chit) => chit.id);
  }

  deserializeDetails(chitIds: string[]): void {
    this.chits = chitIds.map((chitId) => this.findChit(chitId));
  }

  resolveDetails(chitId: string) {
    this.resolved = true;
    this.selectedChit = this.chits.find((chit) => chit.id === chitId);
    if (!this.selectedChit) {
      throw new MismatchError();
    }
  }

  stageIn() {
    this.chits.forEach((c) => (c.onClick = () => this.resolve(c.id)));
  }

  stageOut() {
    this.chits.forEach((c) => (c.onClick = undefined));
  }
}

type PickResolution = { idx: number; value: any };

export class PickPrompt extends Prompt {
  type: PromptType = 'PickPrompt';

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
      .join(' or ');
  }

  override get help() {
    if (this._help) {
      return this._help;
    }

    return this.picks
      .map((p) => p.helpContents)
      .filter((d) => d)
      .join('\n\nor\n\n');
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
    this.resolve({ idx, value });
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
      .filter((p) => p instanceof ButtonPick)
      .map((p) => (p as ButtonPick).button)
      .filter((a) => a) as GameButton[];
  }
}
