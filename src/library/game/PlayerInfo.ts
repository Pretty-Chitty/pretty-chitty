import multiavatar from "@multiavatar/multiavatar";
import base64 from "base-64";

export interface IPlayerInfo {
  id: string;
  name: string;
  imageUrl?: string;
}

export class PlayerInfo {
  public id: string;
  public name: string;

  /** @internal */
  public generateAvatar() {
    if (!this.myImageUrl && window?.URL) {
      const data = multiavatar(`${this.name} ${this.id}`, true).replace("<svg", '<svg width="231" height="231"');
      return `data:image/svg+xml;base64,${base64.encode(data)}`;
    }
    return undefined;
  }

  /** @internal */
  private myImageUrl?: string;
  get imageUrl() {
    if (!this.myImageUrl && window?.URL) {
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
    }

    if (!this.imageUrl && window?.URL) {
      this.imageUrl = this.generateAvatar();
    }
  }
}
