import React, { ReactNode, useEffect, useState } from "react";
import { useGameTheme } from "../hooks/useGameTheme";
import { Box, useTheme } from "@mui/material";
import { ChevronRight } from "@material-ui/icons";
import { ZINDEX_TOP_BAR_BODY, ZINDEX_TOP_BAR_HEADER } from "../utilities/zIndex";

export default function TopBarDropdown({
  label,
  children,
}: {
  label: string | ReactNode;
  children: ReactNode | ReactNode[];
}) {
  const [open, setOpen] = useState(false);
  const theme = useGameTheme();
  const muiTheme = useTheme();

  useEffect(() => {
    if (open) {
      const cb = () => {
        setOpen(false);
      };
      let hasCleared = false;
      setTimeout(() => {
        if (!hasCleared) {
          document.addEventListener("click", cb);
        }
      }, 50);
      return () => {
        hasCleared = true;
        document.removeEventListener("click", cb);
      };
    }
  }, [open]);

  return (
    <Box sx={{ fontFamily: muiTheme.typography.fontFamily }} flex={1}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          userSelect: "none",
          cursor: "pointer",
          pl: 2,
          pr: 4,
          position: "relative",
          fontSize: 14 * theme.fontScalar,
          height: "100%",
          color: theme.barTextColor,
          background: theme.barColor,
          zIndex: ZINDEX_TOP_BAR_HEADER,
          lineHeight: `${theme.topBarHeight}px`,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        <ChevronRight
          style={{
            position: "absolute",
            right: 10,
            top: `calc(50% - ${14 * theme.fontScalar}px)`,
            fontSize: `${25 * theme.fontScalar}px`,
            transform: open ? "rotate(-90deg)" : "rotate(90deg)",
            transition: "transform linear 0.15s",
          }}
        />
      </Box>

      <Box
        sx={{
          position: "absolute",
          top: "100%",
          transform: open ? "translateY(0)" : `translateY(calc(-100% - ${theme.topBarHeight}px - 30px))`,
          transition: "transform ease-in-out 0.15s",
          color: theme.barTextColor,
          left: 0,
          right: 0,
          background: theme.barTopDropdownColor,
          zIndex: ZINDEX_TOP_BAR_BODY,
          boxShadow: `3px 3px 30px ${theme.topBarDropShadowColor}`,
          borderBottomRightRadius: 10,
          borderBottomLeftRadius: 10,
          maxHeight: `calc(60vh - ${theme.topBarHeight}px - 10px)`,
          overflow: "auto",
          fontSize: 14 * theme.fontScalar,
          p: 1,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
