import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { Box, Stack } from "@mui/material";
import { useListRef, type RowComponentProps } from "react-window";
import { List, useDynamicRowHeight } from "react-window";
import { useGameTheme } from "../hooks/useGameTheme";
import { GameModalBackdrop } from "./GameModalBackdrop";
import { TokenDefinition, TokenizedMessage } from "./TokenizedMessage";
import { useTokenMap } from "../hooks/useTokenMap";
import { GameTheme } from "../game/GameTheme";
import { useModalState } from "../hooks/useModalState";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useAnimationSpeedMultiplier, useTimeController } from "../hooks/useTimeController";

interface RowData {
  messages: string[];
  tokenMap: Record<string, TokenDefinition>;
  theme: GameTheme;
}

function RowComponent({ index, messages, style, tokenMap, theme }: RowComponentProps<RowData>) {
  return (
    <Stack
      direction={"row"}
      style={style}
      sx={{
        display: "flex",
        alignItems: "center",
        p: 1,
        pl: 2,
        pr: 2,
        color: theme.actionLogTextColor,
        background: index % 2 === 0 ? "rgba(128,128,128,0.1)" : "transparent",
      }}
    >
      <Box sx={{ width: 25, fontSize: 11, textAlign: "right" }}>{index}</Box>
      <Box flex={1} sx={{ pl: 2 }}>
        <TokenizedMessage message={messages[index]} fontSize={14} tokenMap={tokenMap} />
      </Box>
    </Stack>
  );
}

export function ActionLogHistoryDisplay() {
  const modalState = useModalState();
  const [visible, setVisible] = useEventChannelState(modalState.actionLogVisible);
  const theme = useGameTheme();
  const tokenMap = useTokenMap();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const [messages, setMessages] = useState<string[]>([]);
  const listRef = useListRef(null);
  const clientTime = useTimeController();
  const [maxClock] = useEventChannelState(clientTime.maxClock);

  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 40 });

  useEffect(() => {
    let ignoreResponse = false;
    clientTime.gameLogs().then((logs) => {
      if (!ignoreResponse) {
        setMessages(logs?.map((l) => l.message) ?? []); // TODO: track timestamp and reverse order?
      }
    });
    return () => {
      ignoreResponse = true;
    };
  }, [maxClock, clientTime]);

  // Scroll to top when visible changes from false to true
  useEffect(() => {
    if (visible && listRef.current) {
      listRef.current.scrollToRow({ index: 0 });
    }
  }, [visible, listRef]);

  return (
    <GameModalBackdrop visible={visible} persist>
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          position: "absolute",
          overflow: "hidden",
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
        }}
        onClick={() => setVisible(false)}
      >
        <Stack
          onClick={(e) => e.stopPropagation()}
          sx={{
            background: theme.actionLogDialogBackgroundColor,
            width: `min(90%,${theme.actionBarWidth}px)`,
            height: "90%",
            overflow: "hidden",
            borderRadius: 2,
            transform: !visible ? "translateY(120%)" : "translateY(0)",
            transition: `transform ${0.1 * animationSpeedMultiplier}s ease-in-out`,
          }}
        >
          <Box
            sx={{
              padding: 2,
              borderBottom: `2px solid ${theme.actionLogBackgroundColor}`,
              color: theme.actionLogTextColor,
              fontWeight: "bold",
            }}
          >
            Action Log
          </Box>
          <List<RowData>
            listRef={listRef}
            rowComponent={RowComponent}
            rowCount={messages.length}
            rowHeight={dynamicRowHeight}
            rowProps={{ messages, tokenMap, theme }}
          />
        </Stack>
      </Box>
    </GameModalBackdrop>
  );
}
