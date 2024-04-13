import multiavatar from "@multiavatar/multiavatar";
import base64 from "base-64";

export class PlayerInfo {
  public imageUrl?: string;

  constructor(
    public id: string,
    public name: string,
  ) {
    if (window?.URL) {
      const data = multiavatar(`${this.name} ${this.id}`, true).replace("<svg", '<svg width="231" height="231"');

      this.imageUrl = `data:image/svg+xml;base64,${base64.encode(data)}`;
    }
  }
}
