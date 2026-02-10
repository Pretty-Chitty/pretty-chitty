import React from "react";
import { createRoot } from "react-dom/client";
import Root from "./root";

import "@fontsource/quicksand/400.css";
import "@fontsource/quicksand/700.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<Root />);
}
