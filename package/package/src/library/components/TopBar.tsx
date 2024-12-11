import React, { ReactNode } from "react";
import { Box, Stack } from "@mui/material";

import { useGameTheme } from "../hooks/useGameTheme";
import TopBarDropdown from "./TopBarDropdown";
import TopBarPlayers from "./TopBarPlayers";
import { useChit } from "../hooks/useChits";
import { RootChit } from "../game/RootChit";
import { DropdownChit } from "../game/DropdownChit";

function BaseTopBar({ children }: { children: ReactNode | ReactNode[] }) {
  const theme = useGameTheme();
  return (
    <Box
      sx={{
        position: "relative",
        background: theme.barColor,
        height: theme.topBarHeight,
      }}
    >
      {children}
    </Box>
  );
}

function DropdownChitWrapper({ chitId }: { chitId: string | undefined }) {
  const chit = useChit<DropdownChit>(chitId ?? "");

  if (!chitId) {
    return null;
  }

  if (chit) {
    return (
      <TopBarDropdown label={chit.renderLabel()}>
        {chit.renderBody()}
      </TopBarDropdown>
    );
  }
  return null;
}

export default function TopBar() {
  const theme = useGameTheme();
  const rootChit = useChit<RootChit<any>>("root");
  const dropdowns = rootChit?.getDropdowns() ?? [];

  const barWidth = `${(1 / (dropdowns.length + 1)) * 100}%`;

  return (
    <BaseTopBar>
      <Stack direction="row" sx={{ width: "100%", height: "100%" }}>
        <Box sx={{ width: barWidth }}>
          <TopBarPlayers />
        </Box>
        {dropdowns.map((dropdown) => (
          <Box
            key={dropdown._id}
            sx={{ width: barWidth, borderLeft: `1px solid ${theme.barBreak}` }}
          >
            <DropdownChitWrapper chitId={dropdown._id} />
          </Box>
        ))}
      </Stack>
    </BaseTopBar>
  );
}
