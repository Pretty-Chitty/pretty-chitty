import React from "react";
import { Grid, Paper, Box } from "@mui/material";
import base64 from "base-64";

const CheckerImg = `data:image/svg+xml;base64,${base64.encode(
  `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <path d="M0 0h8v16h8V8H0z" opacity=".07"/>
  </svg>
  `,
)}`;

export default function StageAndEditor({ children, editor }: { children: any; editor: any }) {
  return (
    <Grid container sx={{ width: "100%", height: "100%" }}>
      <Grid item xs={9} style={{ height: "100%" }}>
        <Box sx={{ p: 3, height: "100%", position: "relative", background: `url(${CheckerImg})` }}>{children}</Box>
      </Grid>
      <Grid item xs={3} style={{ height: "100%", position: "relative" }}>
        <Box sx={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "scroll" }}>
          <Paper elevation={2} square style={{ background: "#f9f9f9" }}>
            <Box sx={{ p: 3 }}>{editor}</Box>
          </Paper>
        </Box>
      </Grid>
    </Grid>
  );
}
