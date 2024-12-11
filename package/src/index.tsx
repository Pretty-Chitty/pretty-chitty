import "reflect-metadata";
import React from "react";
import { createRoot } from "react-dom/client";
import Root from "./root";
import { Chit } from "./library";

class OtherChitType extends Chit {}

class TestChit extends Chit {
  testOutlet = new OtherChitType();
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);

  root.render(<Root />);
}
