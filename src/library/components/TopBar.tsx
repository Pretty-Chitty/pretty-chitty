import React, { ReactNode, useState } from "react";
import { Box, IconButton, Stack } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import TopBarDropdown from "./TopBarDropdown";
import BottomBarBreak from "./BottomBarBreak";
import TopBarPlayers from "./TopBarPlayers";
import { useTimeController } from "../hooks/useTimeController";
import { useChit } from "../hooks/useChits";
import { RootChit } from "../game/RootChit";
import { DropdownChit } from "../game/DropdownChit";
import { ArrowBack } from "@material-ui/icons";
import { ZINDEX_TOP_BAR_HEADER } from "../utilities/zIndex";
import { usePlayerId } from "../hooks/usePlayer";

function BaseTopBar({ children }: { children: ReactNode | ReactNode[] }) {
  const theme = useGameTheme();
  return (
    <Box
      sx={{
        position: "relative",
        background: theme.barColor,
        height: theme.topBarHeight,
        // A fixed-height bar in the viewer's flex column: never squeezed when the table needs the room
        flexShrink: 0,
      }}
    >
      {children}
    </Box>
  );
}

function DropdownChitWrapper({ chitId }: { chitId: string | undefined }) {
  const chit = useChit<DropdownChit>(chitId ?? "");
  const playerId = usePlayerId();

  if (!chitId) {
    return null;
  }

  if (chit) {
    return <TopBarDropdown label={chit.renderLabel(playerId)}>{chit.renderBody(playerId)}</TopBarDropdown>;
  }
  return null;
}

export default function TopBar({ onBack }: { onBack?: () => void }) {
  const theme = useGameTheme();
  const rootChit = useChit<RootChit<any>>("root");
  const dropdowns = rootChit?.getDropdowns() ?? [];

  const barWidth = `${(1 / (dropdowns.length + 1)) * 100}%`;
  const BUTTON_WIDTH = theme.topBarHeight - theme.spacing * 2;

  return (
    <BaseTopBar>
      <Stack direction="row" sx={{ width: "100%", height: "100%" }}>
        {onBack && (
          <Box
            sx={{
              height: "100%",
              width: BUTTON_WIDTH,
              position: "relative",
              background: theme.barColor,
              zIndex: ZINDEX_TOP_BAR_HEADER,
            }}
          >
            <IconButton
              sx={{
                width: BUTTON_WIDTH,
                color: theme.barTextColor,
                height: "100%",
              }}
              onClick={onBack}
            >
              <ArrowBack />
            </IconButton>
          </Box>
        )}
        <Stack direction="row" flex={1} sx={{ width: `calc(100% - ${BUTTON_WIDTH}px)` }}>
          <Box sx={{ width: barWidth }}>
            <TopBarPlayers />
          </Box>
          {dropdowns.map((dropdown) => (
            // a tutorial points at a dropdown (a player aid) as `{ ui: "dropdown:<chit id>" }`
            <Box key={dropdown.id} data-tutorial-target={`dropdown:${dropdown.id}`} sx={{ width: barWidth, borderLeft: `1px solid ${theme.barBreak}` }}>
              <DropdownChitWrapper chitId={dropdown.id} />
            </Box>
          ))}
        </Stack>
      </Stack>
    </BaseTopBar>
  );
}
