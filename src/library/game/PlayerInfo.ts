import multiavatar from "@multiavatar/multiavatar";
import base64 from "base-64";

/** Marks a seat as played by the engine's AI (see `connectAiPlayer`). */
export type AiSeatInfo = {
  /** 0–1; lower plays less predictably. Default 0.85 */
  difficulty?: number;
};

export interface IPlayerInfo {
  id: string;
  name: string;
  imageUrl?: string;
  ai?: AiSeatInfo;
}

export class PlayerInfo {
  public id: string;
  public name: string;
  /** Set when this seat is an AI player */
  public ai?: AiSeatInfo;

  /** @internal */
  public generateAvatar() {
    if (!this.myImageUrl && typeof window !== "undefined" && window.URL) {
      const data = multiavatar(`${this.name} ${this.id}`, true).replace("<svg", '<svg width="231" height="231"');
      return `data:image/svg+xml;base64,${base64.encode(data)}`;
    }
    return undefined;
  }

  /** @internal */
  private myImageUrl?: string;
  get imageUrl() {
    if (!this.myImageUrl && typeof window !== "undefined" && window.URL) {
      return this.generateAvatar();
    }
    return this.myImageUrl;
  }
  set imageUrl(value: string | undefined) {
    this.myImageUrl = value;
  }

  constructor(idOrPlayerInfo: string | IPlayerInfo, name?: string) {
    if (typeof idOrPlayerInfo === "string") {
      this.id = idOrPlayerInfo;
      this.name = name!;
    } else {
      this.id = idOrPlayerInfo.id;
      this.name = idOrPlayerInfo.name;
      this.imageUrl = idOrPlayerInfo.imageUrl;
      this.ai = idOrPlayerInfo.ai;
    }

    if (!this.imageUrl && typeof window !== "undefined" && window.URL) {
      this.imageUrl = this.generateAvatar();
    }
  }
}
