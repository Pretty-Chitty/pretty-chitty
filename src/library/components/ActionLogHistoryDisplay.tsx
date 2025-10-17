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
import { useAnimationSpeedMultiplier, useTimeController, useTimeState } from "../hooks/useTimeController";

interface LogEntry {
  message: string;
  clock: number;
  endClock: number;
}

interface RowData {
  messages: LogEntry[];
  tokenMap: Record<string, TokenDefinition>;
  theme: GameTheme;
}

function RowComponent({ index, messages, style, tokenMap, theme }: RowComponentProps<RowData>) {
  const modalState = useModalState();
  const clientTime = useTimeController();
  const clientTimeState = useTimeState();
  const [currentClock] = useEventChannelState(clientTime.currentClock);
  const [, setTargetClock] = useEventChannelState(clientTimeState.targetClock);
  const [, setLive] = useEventChannelState(clientTimeState.live);
  const isCurrent = currentClock.clock > messages[index].clock && currentClock.clock <= messages[index].endClock;

  return (
    <Stack
      onClick={() => {
        setTargetClock(messages[index].clock + 1);
        setLive(false);
        modalState.actionLogVisible.value = false;
      }}
      direction={"row"}
      style={style}
      sx={{
        display: "flex",
        alignItems: "center",
        p: 1,
        pl: 2,
        pr: 2,
        cursor: "pointer",
        color: theme.actionLogTextColor,
        background: isCurrent
          ? theme.actionLogDialogHighlightBackgroundColor
          : index % 2 === 0
            ? "rgba(128,128,128,0.1)"
            : "transparent",
      }}
    >
      <Box sx={{ width: 25, fontSize: 11, textAlign: "right" }}>{messages[index].clock + 1}</Box>
      <Box flex={1} sx={{ pl: 2 }}>
        <TokenizedMessage message={messages[index].message} fontSize={14} tokenMap={tokenMap} />
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
  const [messages, setMessages] = useState<LogEntry[]>([]);
  const listRef = useListRef(null);
  const clientTime = useTimeController();
  const [maxClock] = useEventChannelState(clientTime.maxClock);
  const [currentClock] = useEventChannelState(clientTime.currentClock);

  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 40 });

  useEffect(() => {
    let ignoreResponse = false;
    clientTime.gameLogs().then((logs) => {
      if (!ignoreResponse) {
        setMessages(
          logs
            ?.map((l, i) => ({
              message: l.message,
              clock: l.clock,
              endClock: logs[i + 1]?.clock ?? Number.MAX_SAFE_INTEGER,
            }))
            .reverse() ?? [],
        );
      }
    });
    return () => {
      ignoreResponse = true;
    };
  }, [maxClock, clientTime]);

  // Scroll to top when visible changes from false to true
  useEffect(() => {
    if (visible && listRef.current) {
      const index = messages.findIndex((m) => m.clock <= currentClock.clock && m.endClock > currentClock.clock);
      if (index >= 0) {
        listRef.current.scrollToRow({ index });
      }
    }
  }, [visible, listRef, messages, currentClock]);

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
