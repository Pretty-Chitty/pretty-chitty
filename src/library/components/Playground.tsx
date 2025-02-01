import React, { useEffect, useState, ReactNode } from "react";

import SelectableItemAndStage from "./SelectableItemAndStage";
import { Chit } from "../game/Chit";
import { Box, Button, Stack, Tabs, Tab, ToggleButton, ToggleButtonGroup } from "@mui/material";
import useLocalStorageState from "use-local-storage-state";
import { MatchViewer } from "./MatchViewer";
import { Game } from "../game/Game";
import { GameProvider } from "../hooks/useGame";
import { ConnectionProvider } from "../hooks/useConnection";
import { Connection } from "../game/Connection";
import { LocalConnectionTransport } from "../game/ConnectionTransport";
import { Match } from "../game/Match";
import { PlayerInfo } from "../game/PlayerInfo";
import { LocalMatchStorage } from "../game/MatchStorage";
import { GridOn, PhoneIphone, Tab as TabIcon } from "@material-ui/icons";
import { PlayerProvider } from "../hooks/usePlayer";

type Layout = "tile" | "tab" | "phone";

export interface IChitLibrary {
  [key: string]: new () => Chit;
}

function PlayerEditor({ playerId, match, showBack }: { showBack?: boolean; playerId: string; match: Match<any, any> }) {
  const [localConnection, setLocalConnection] = useState<Connection | undefined>();
  const [, setRemoteConnection] = useState<LocalConnectionTransport>(new LocalConnectionTransport());

  useEffect(() => {
    const newRemoteConnection = new LocalConnectionTransport();
    const newConnection = new Connection(new LocalConnectionTransport());
    (newConnection.transport as LocalConnectionTransport).connect(newRemoteConnection);
    match.connect(newRemoteConnection, playerId);

    setLocalConnection(newConnection);
    setRemoteConnection(newRemoteConnection);
    return () => {
      newConnection.dispose();
      // TODO:
      // match.disconnection(newRemoteConnection);
    };
  }, [match, playerId]);

  if (!localConnection) {
    return null;
  }

  return (
    <ConnectionProvider connection={localConnection}>
      <PlayerProvider playerId={playerId}>
        <MatchViewer onBack={showBack ? () => {} : undefined} />
      </PlayerProvider>
    </ConnectionProvider>
  );
}

function MatchGrid({ match }: { match: Match<any, any> }) {
  let rows = Math.ceil(Math.sqrt(match.players.length));
  let columns = Math.ceil(match.players.length / rows);

  if (rows > columns) {
    const t = rows;
    rows = columns;
    columns = t;
  }

  const playerRows = match.players.reduce((acc: PlayerInfo[][], player, i) => {
    const rowIndex = Math.floor(i / columns);
    acc[rowIndex] ??= [];
    acc[rowIndex].push(player);
    return acc;
  }, []);
  return (
    <Stack direction={"column"} sx={{ overflow: "hidden", height: "100%", width: "100%" }}>
      {playerRows.map((ps, i) => (
        <Stack key={i} direction="row" sx={{ height: `${100 / playerRows.length}%`, width: "100%" }}>
          {ps.map((p) => (
            <Box key={p.id} sx={{ width: `${100 / ps.length}%`, height: "100%" }}>
              <PlayerEditor playerId={p.id} match={match} />
            </Box>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function MatchTabs({ match }: { match: Match<any, any> }) {
  const [tabIndex, setTabIndex] = useLocalStorageState("selectedPlayerIndex", {
    defaultValue: 0,
  });
  if (tabIndex >= match.players.length && tabIndex > 0) {
    setTabIndex(0);
    return null;
  }

  return (
    <Stack sx={{ height: "100%", width: "100%" }}>
      <Tabs
        value={tabIndex}
        onChange={(e, newValue) => setTabIndex(newValue)}
        indicatorColor="secondary"
        textColor="inherit"
        variant="fullWidth"
      >
        {match.players.map((p) => (
          <Tab label={p.name} key={p.id} />
        ))}
      </Tabs>
      <Box flex={1} sx={{ height: "100%" }}>
        {[match.players[tabIndex].id].map((id) => (
          <PlayerEditor key={id} playerId={id} match={match} />
        ))}
      </Box>
    </Stack>
  );
}

function MatchPhone({ match }: { match: Match<any, any> }) {
  return (
    <Box sx={{ height: "100%", width: "100%", overflow: "scroll" }}>
      <Stack direction={"row"} sx={{ width: `${390 * match.players.length}px` }}>
        {match.players.map((p) => (
          <Box key={p.id} sx={{ width: `390px`, height: "684px" }}>
            <PlayerEditor showBack playerId={p.id} match={match} />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function Editor({
  setButtons,
  layout,
  game,
  matchInformation,
}: {
  setButtons: (buttons: ReactNode) => void;
  layout: Layout;
  game: Game<any, any>;
  matchInformation: string;
}) {
  const [match, setMatch] = useState<Match<any, any> | null>(null);

  useEffect(() => {
    const FIRST_NAMES = ["Fred", "Steve", "Paul"];
    const LAST_NAMES = ["Johnson", "Dennis", "Green"];
    const storage = new LocalMatchStorage(matchInformation);
    const players = [];
    for (let i = 0; i < 3; i++) {
      players.push(new PlayerInfo(`p${i}`, `${FIRST_NAMES[i % 3]} ${LAST_NAMES[i % 3]}`));
    }
    const match = new Match(game, players, storage);
    let cancelled = false;
    match.load().then(() => {
      if (cancelled) {
        return;
      }
      match.start();
      setMatch(match);

      const saveStateToLocalStorage = (key: string, state: any) => {
        localStorage.setItem(key, JSON.stringify(state));
      };

      const readStateFromLocalStorage = (key: string) => {
        const state = localStorage.getItem(key);
        return state ? JSON.parse(state) : {};
      };

      let aState = readStateFromLocalStorage("aState");
      let bState = readStateFromLocalStorage("bState");

      setButtons(
        <>
          <Button>New</Button>
          <Button onClick={() => storage.saveState({}, [], "active", undefined, true)}>Reset</Button>

          <Button
            onClick={() =>
              storage.readState().then((d) => {
                aState = d;
                saveStateToLocalStorage("aState", aState);
              })
            }
          >
            Save A
          </Button>
          <Button
            onClick={() =>
              storage.readState().then((d) => {
                bState = d;
                saveStateToLocalStorage("bState", bState);
              })
            }
          >
            Save B
          </Button>
          <Button
            onClick={() => {
              aState = readStateFromLocalStorage("aState");
              storage.saveState(aState, [], "active", undefined, true);
            }}
          >
            Read A
          </Button>
          <Button
            onClick={() => {
              bState = readStateFromLocalStorage("bState");
              storage.saveState(bState, [], "active", undefined, true);
            }}
          >
            Read B
          </Button>
        </>,
      );
    });
    return () => {
      match.dispose();
      cancelled = true;
    };
  }, [game, matchInformation, setButtons]);

  if (!match) {
    return null;
  }

  return (
    <GameProvider game={game}>
      {layout === "tile" && <MatchGrid match={match} />}
      {layout === "tab" && <MatchTabs match={match} />}
      {layout === "phone" && <MatchPhone match={match} />}
    </GameProvider>
  );
}

export default function Playground({ game }: { game: Game<any, any> }) {
  const [layout, setLayout] = useLocalStorageState<Layout>("matchViewerLayout", {
    defaultValue: "tile",
  });
  const [buttons, setButtons] = useState<ReactNode | null>(null);

  const items = ["a"];

  return (
    <SelectableItemAndStage
      keySpace="playground"
      items={items}
      topOptions={
        <Stack direction="row">
          {buttons}

          <ToggleButtonGroup
            exclusive
            size="small"
            sx={{ m: 2 }}
            value={layout}
            onChange={(e, newValue) => setLayout(newValue)}
          >
            <ToggleButton value="tile">
              <GridOn />
            </ToggleButton>
            <ToggleButton value="tab">
              <TabIcon />
            </ToggleButton>
            <ToggleButton value="phone">
              <PhoneIphone />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      }
      render={(item) => <Editor setButtons={setButtons} layout={layout} matchInformation={item} game={game} />}
    />
  );
}
