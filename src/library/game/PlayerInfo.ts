import multiavatar from "@multiavatar/multiavatar";
import base64 from "base-64";

export interface IPlayerInfo {
  id: string;
  name: string;
}

export class PlayerInfo {
  public imageUrl?: string;
  public id: string;
  public name: string;

  constructor(idOrPlayerInfo: string | IPlayerInfo, name?: string) {
    if (typeof idOrPlayerInfo === "string") {
      this.id = idOrPlayerInfo;
      this.name = name!;
    } else {
      this.id = idOrPlayerInfo.id;
      this.name = idOrPlayerInfo.name;
    }

    if (window?.URL) {
      const data = multiavatar(`${this.name} ${this.id}`, true).replace("<svg", '<svg width="231" height="231"');
      this.imageUrl = `data:image/svg+xml;base64,${base64.encode(data)}`;
    }
  }
}
