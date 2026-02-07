import React, { useEffect, useState, useCallback } from "react";

import { Chit } from "../game/Chit";
import {
  Box,
  Button,
  Stack,
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Add, Delete, Refresh, GridOn, PhoneIphone, Tab as TabIcon, Upload, Download } from "@mui/icons-material";
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
import { PlayerProvider } from "../hooks/usePlayer";
import { LoadingStateProvider, LoadingStates } from "../hooks/useLoadingStates";
import { RootChit } from "../game/RootChit";
import { SelectablePropertyInfo } from "../utilities/Annotations";

type Layout = "tile" | "tab" | "phone";

export interface IChitLibrary {
  [key: string]: new () => Chit;
}

// Saved match metadata structure
interface SavedMatchInfo {
  matchId: string;
  name: string;
  playerCount: number;
  matchOptions: any;
  createdAt: number;
}

// Helper functions for match storage
function getGameStoragePrefix(gameName: string): string {
  return `playground_${gameName}`;
}

function getMatchListKey(gameName: string): string {
  return `${getGameStoragePrefix(gameName)}_matchList`;
}

function getMatchMetaKey(gameName: string, matchId: string): string {
  return `${getGameStoragePrefix(gameName)}_meta_${matchId}`;
}

function getMatchStateKey(gameName: string, matchId: string): string {
  return `${getGameStoragePrefix(gameName)}_state_${matchId}`;
}

function loadMatchList(gameName: string): string[] {
  const raw = localStorage.getItem(getMatchListKey(gameName));
  return raw ? JSON.parse(raw) : [];
}

function saveMatchList(gameName: string, matchIds: string[]): void {
  localStorage.setItem(getMatchListKey(gameName), JSON.stringify(matchIds));
}

function loadMatchMeta(gameName: string, matchId: string): SavedMatchInfo | null {
  const raw = localStorage.getItem(getMatchMetaKey(gameName, matchId));
  return raw ? JSON.parse(raw) : null;
}

function saveMatchMeta(gameName: string, info: SavedMatchInfo): void {
  localStorage.setItem(getMatchMetaKey(gameName, info.matchId), JSON.stringify(info));
}

function deleteMatchData(gameName: string, matchId: string): void {
  localStorage.removeItem(getMatchMetaKey(gameName, matchId));
  localStorage.removeItem(getMatchStateKey(gameName, matchId));
}

function generateMatchId(): string {
  return `match_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const FIRST_NAMES = ["Fred", "Steve", "Paul", "Josh", "Sara", "Miles", "Anna", "Chris", "Dana", "Eric"];
const LAST_NAMES = ["Johnson", "Dennis", "Green", "Breckman", "Stevens", "Smith", "Brown", "Wilson", "Moore", "Taylor"];

function generatePlayerName(index: number): string {
  return `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[index % LAST_NAMES.length]}`;
}

// Dialog for creating a new match
function NewMatchDialog({
  open,
  onClose,
  onCreate,
  configOptions,
  minPlayers,
  maxPlayers,
  defaultPlayerCount,
  defaultMatchOptions,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, playerCount: number, matchOptions: any) => void;
  configOptions: SelectablePropertyInfo[];
  minPlayers: number;
  maxPlayers: number;
  defaultPlayerCount: number;
  defaultMatchOptions: any;
}) {
  const [name, setName] = useState(`Match ${Date.now()}`);
  const [playerCount, setPlayerCount] = useState(defaultPlayerCount);
  const [matchOptions, setMatchOptions] = useState<any>({ ...defaultMatchOptions });

  useEffect(() => {
    if (open) {
      setName(`Match ${new Date().toLocaleString()}`);
      setPlayerCount(defaultPlayerCount);
      setMatchOptions({ ...defaultMatchOptions });
    }
  }, [open, defaultPlayerCount, defaultMatchOptions]);

  const handleCreate = () => {
    onCreate(name, playerCount, matchOptions);
    onClose();
  };

  const playerCountOptions = [];
  for (let i = minPlayers; i <= maxPlayers; i++) {
    playerCountOptions.push(i);
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Match</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          <TextField
            label="Match Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
          />
          <FormControl fullWidth>
            <InputLabel>Player Count</InputLabel>
            <Select
              value={playerCount}
              label="Player Count"
              onChange={(e) => setPlayerCount(Number(e.target.value))}
            >
              {playerCountOptions.map((count) => (
                <MenuItem key={count} value={count}>
                  {count} Players
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {configOptions.map((option) => (
            <FormControl key={option.fieldName} fullWidth>
              <InputLabel>{option.config.label}</InputLabel>
              <Select
                value={matchOptions[option.fieldName] ?? option.currentValue}
                label={option.config.label}
                onChange={(e) =>
                  setMatchOptions((prev: any) => ({
                    ...prev,
                    [option.fieldName]: e.target.value,
                  }))
                }
              >
                {option.config.choices.map((choice) => (
                  <MenuItem key={choice.id} value={choice.id}>
                    {choice.label ?? choice.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} variant="contained" disabled={!name.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Dialog for loading state from a database export
function LoadStateDialog({
  open,
  onClose,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (data: {
    state: any;
    options: any;
    playerCount: number;
    playerNames: string[];
    name?: string;
  }) => void;
}) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setJsonText("");
      setError(null);
    }
  }, [open]);

  const handleLoad = () => {
    try {
      const parsed = JSON.parse(jsonText);

      // Extract relevant fields
      const state = parsed.state;
      if (!state) {
        setError("No 'state' field found in the JSON");
        return;
      }

      const options = parsed.options || {};
      const numPlayers = parsed.numPlayers || Object.keys(parsed.players || {}).length || 2;

      // Extract player names from the players object
      const playerNames: string[] = [];
      if (parsed.players && typeof parsed.players === "object") {
        // Players might be keyed by ID, so we need to get them in order
        const playerEntries = Object.values(parsed.players) as any[];
        for (let i = 0; i < numPlayers; i++) {
          if (playerEntries[i]?.name) {
            playerNames.push(playerEntries[i].name);
          } else {
            playerNames.push(generatePlayerName(i));
          }
        }
      } else {
        for (let i = 0; i < numPlayers; i++) {
          playerNames.push(generatePlayerName(i));
        }
      }

      onLoad({
        state,
        options,
        playerCount: numPlayers,
        playerNames,
        name: parsed.name,
      });
      onClose();
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Load State from Database Export</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Paste database JSON here"
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setError(null);
            }}
            multiline
            rows={15}
            fullWidth
            placeholder='{"state": {...}, "players": {...}, "options": {...}, ...}'
            error={!!error}
            helperText={error}
            sx={{
              "& .MuiInputBase-input": {
                fontFamily: "monospace",
                fontSize: "12px",
              },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleLoad} variant="contained" disabled={!jsonText.trim()}>
          Load State
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Dialog for exporting/viewing current state
function ExportStateDialog({
  open,
  onClose,
  matchInfo,
  gameName,
}: {
  open: boolean;
  onClose: () => void;
  matchInfo: SavedMatchInfo | null;
  gameName: string;
}) {
  const [jsonText, setJsonText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && matchInfo) {
      // Build the export object
      const storageKey = getMatchStateKey(gameName, matchInfo.matchId);
      const stateRaw = localStorage.getItem(`match${storageKey}`);
      const state = stateRaw ? JSON.parse(stateRaw) : {};

      // Build players object
      const players: Record<string, { name: string; id: string }> = {};
      for (let i = 0; i < matchInfo.playerCount; i++) {
        const playerId = `p${i}`;
        players[playerId] = {
          id: playerId,
          name: generatePlayerName(i),
        };
      }

      const exportData = {
        name: matchInfo.name,
        numPlayers: matchInfo.playerCount,
        options: matchInfo.matchOptions,
        players,
        state,
      };

      setJsonText(JSON.stringify(exportData, null, 2));
      setCopied(false);
    }
  }, [open, matchInfo, gameName]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Export Match State</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Match State JSON"
            value={jsonText}
            multiline
            rows={15}
            fullWidth
            InputProps={{
              readOnly: true,
            }}
            sx={{
              "& .MuiInputBase-input": {
                fontFamily: "monospace",
                fontSize: "12px",
              },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={handleCopy} variant="contained">
          {copied ? "Copied!" : "Copy to Clipboard"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PlayerEditor({
  playerId,
  match,
  showBack,
}: {
  showBack?: boolean;
  playerId: string;
  match: Match<any, any>;
}) {
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
  layout,
  game,
  matchInfo,
}: {
  layout: Layout;
  game: Game<any, any>;
  matchInfo: SavedMatchInfo;
}) {
  const [match, setMatch] = useState<Match<any, any> | null>(null);
  const [storage, setStorage] = useState<LocalMatchStorage | null>(null);

  useEffect(() => {
    const gameName = game.metadata.name;
    const storageKey = getMatchStateKey(gameName, matchInfo.matchId);
    const newStorage = new LocalMatchStorage(storageKey);
    setStorage(newStorage);

    const players: PlayerInfo[] = [];
    for (let i = 0; i < matchInfo.playerCount; i++) {
      players.push(new PlayerInfo(`p${i}`, generatePlayerName(i)));
    }

    const newMatch = new Match(game, players, newStorage, matchInfo.matchOptions);
    let cancelled = false;

    newMatch.load().then(() => {
      if (cancelled) {
        return;
      }
      newMatch.start();
      setMatch(newMatch);
    });

    return () => {
      newMatch.dispose();
      cancelled = true;
    };
  }, [game, matchInfo]);

  if (!match || !storage) {
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
  const [loadingStates] = useState<LoadingStates>(new LoadingStates());
  const [layout, setLayout] = useLocalStorageState<Layout>("matchViewerLayout", {
    defaultValue: "tile",
  });
  const [loadingProgress, setLoadingProgress] = useState<string>("");
  const [newMatchDialogOpen, setNewMatchDialogOpen] = useState(false);
  const [matches, setMatches] = useState<SavedMatchInfo[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useLocalStorageState<string>(
    `playground_${game.metadata.name}_selectedMatch`,
    { defaultValue: "" }
  );
  const [matchKey, setMatchKey] = useState(0); // For forcing re-render on reset
  const [loadStateDialogOpen, setLoadStateDialogOpen] = useState(false);
  const [exportStateDialogOpen, setExportStateDialogOpen] = useState(false);

  const gameName = game.metadata.name;

  // Get config options from a temporary RootChit instance
  const getConfigInfo = useCallback(() => {
    const tempRoot = new game.chitLibrary.Root() as RootChit<any>;
    const defaultPlayerCount = tempRoot.setupDemoGame();
    const configOptions = tempRoot.getConfigurationOptions();
    const defaultMatchOptions = tempRoot.getCurrentlySelectedMatchOptions();
    return {
      configOptions,
      defaultPlayerCount,
      defaultMatchOptions,
      minPlayers: tempRoot.minPlayers,
      maxPlayers: tempRoot.maxPlayers,
    };
  }, [game]);

  // Load matches from localStorage
  const loadMatches = useCallback(() => {
    const matchIds = loadMatchList(gameName);
    const loadedMatches: SavedMatchInfo[] = [];
    for (const id of matchIds) {
      const meta = loadMatchMeta(gameName, id);
      if (meta) {
        loadedMatches.push(meta);
      }
    }
    // Sort by creation time, newest first
    loadedMatches.sort((a, b) => b.createdAt - a.createdAt);
    setMatches(loadedMatches);
    return loadedMatches;
  }, [gameName]);

  // Initialize: load matches and create default if none exist
  useEffect(() => {
    const loaded = loadMatches();
    if (loaded.length === 0) {
      // Create a default match from demo game settings
      const { defaultPlayerCount, defaultMatchOptions } = getConfigInfo();
      const matchId = generateMatchId();
      const newMatchInfo: SavedMatchInfo = {
        matchId,
        name: "Default Match",
        playerCount: defaultPlayerCount,
        matchOptions: defaultMatchOptions,
        createdAt: Date.now(),
      };
      saveMatchMeta(gameName, newMatchInfo);
      saveMatchList(gameName, [matchId]);
      setMatches([newMatchInfo]);
      setSelectedMatchId(matchId);
    } else if (!selectedMatchId || !loaded.find((m) => m.matchId === selectedMatchId)) {
      setSelectedMatchId(loaded[0].matchId);
    }
  }, [gameName, loadMatches, getConfigInfo, selectedMatchId, setSelectedMatchId]);

  useEffect(() => {
    return loadingStates.onChange((total, loaded) => {
      if (total === 0 || loaded >= total) {
        setLoadingProgress("");
      } else {
        const percent = Math.round((loaded / total) * 100);
        setLoadingProgress(`${percent}%`);
      }
    });
  }, [loadingStates]);

  const handleCreateMatch = (name: string, playerCount: number, matchOptions: any) => {
    const matchId = generateMatchId();
    const newMatchInfo: SavedMatchInfo = {
      matchId,
      name,
      playerCount,
      matchOptions,
      createdAt: Date.now(),
    };
    saveMatchMeta(gameName, newMatchInfo);
    const matchIds = loadMatchList(gameName);
    matchIds.unshift(matchId);
    saveMatchList(gameName, matchIds);
    setMatches((prev) => [newMatchInfo, ...prev]);
    setSelectedMatchId(matchId);
  };

  const handleDeleteMatch = () => {
    if (!selectedMatchId) return;
    if (!confirm("Are you sure you want to delete this match?")) return;

    deleteMatchData(gameName, selectedMatchId);
    const matchIds = loadMatchList(gameName).filter((id) => id !== selectedMatchId);
    saveMatchList(gameName, matchIds);

    const newMatches = matches.filter((m) => m.matchId !== selectedMatchId);
    setMatches(newMatches);

    if (newMatches.length > 0) {
      setSelectedMatchId(newMatches[0].matchId);
    } else {
      // Create a new default match if all were deleted
      const { defaultPlayerCount, defaultMatchOptions } = getConfigInfo();
      const matchId = generateMatchId();
      const newMatchInfo: SavedMatchInfo = {
        matchId,
        name: "Default Match",
        playerCount: defaultPlayerCount,
        matchOptions: defaultMatchOptions,
        createdAt: Date.now(),
      };
      saveMatchMeta(gameName, newMatchInfo);
      saveMatchList(gameName, [matchId]);
      setMatches([newMatchInfo]);
      setSelectedMatchId(matchId);
    }
  };

  const handleResetMatch = () => {
    if (!selectedMatchId) return;
    const matchInfo = matches.find((m) => m.matchId === selectedMatchId);
    if (!matchInfo) return;

    // Clear the match state in localStorage
    const storageKey = getMatchStateKey(gameName, selectedMatchId);
    localStorage.removeItem(`match${storageKey}`);

    // Force re-render of the Editor
    setMatchKey((prev) => prev + 1);
  };

  const handleLoadState = (data: {
    state: any;
    options: any;
    playerCount: number;
    playerNames: string[];
    name?: string;
  }) => {
    if (!selectedMatchId) return;
    const matchInfo = matches.find((m) => m.matchId === selectedMatchId);
    if (!matchInfo) return;

    // Update match metadata with new player count and options
    const updatedMatchInfo: SavedMatchInfo = {
      ...matchInfo,
      playerCount: data.playerCount,
      matchOptions: data.options,
      name: data.name ? `${matchInfo.name} (${data.name})` : matchInfo.name,
    };
    saveMatchMeta(gameName, updatedMatchInfo);
    setMatches((prev) => prev.map((m) => (m.matchId === selectedMatchId ? updatedMatchInfo : m)));

    // Save the state to localStorage
    const storageKey = getMatchStateKey(gameName, selectedMatchId);
    localStorage.setItem(`match${storageKey}`, JSON.stringify(data.state));

    // Force re-render of the Editor
    setMatchKey((prev) => prev + 1);
  };

  const selectedMatch = matches.find((m) => m.matchId === selectedMatchId);
  const configInfo = getConfigInfo();

  return (
    <LoadingStateProvider loadingStates={loadingStates}>
      <Stack sx={{ height: "100%" }}>
        <Paper elevation={3} sx={{ position: "relative" }}>
          <Stack direction={"row"} alignItems="center" spacing={1} sx={{ p: 1 }}>
            <FormControl sx={{ minWidth: 200 }}>
              <Select
                variant="standard"
                value={selectedMatch ? selectedMatchId : ""}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                displayEmpty
              >
                {matches.map((m) => (
                  <MenuItem key={m.matchId} value={m.matchId}>
                    {m.name} ({m.playerCount}P)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Tooltip title="New Match">
              <IconButton onClick={() => setNewMatchDialogOpen(true)} size="small">
                <Add />
              </IconButton>
            </Tooltip>

            <Tooltip title="Reset Match">
              <IconButton onClick={handleResetMatch} size="small" disabled={!selectedMatchId}>
                <Refresh />
              </IconButton>
            </Tooltip>

            <Tooltip title="Delete Match">
              <IconButton onClick={handleDeleteMatch} size="small" disabled={!selectedMatchId}>
                <Delete />
              </IconButton>
            </Tooltip>

            <Tooltip title="Load State">
              <IconButton onClick={() => setLoadStateDialogOpen(true)} size="small" disabled={!selectedMatchId}>
                <Upload />
              </IconButton>
            </Tooltip>

            <Tooltip title="Export State">
              <IconButton onClick={() => setExportStateDialogOpen(true)} size="small" disabled={!selectedMatchId}>
                <Download />
              </IconButton>
            </Tooltip>

            <Box sx={{ flexGrow: 1 }} />

            {loadingProgress && <Box sx={{ mr: 2 }}>{loadingProgress}</Box>}

            <ToggleButtonGroup
              exclusive
              size="small"
              value={layout}
              onChange={(e, newValue) => newValue && setLayout(newValue)}
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
        </Paper>
        <Box flexGrow={1}>
          {selectedMatch && (
            <Editor
              key={`${selectedMatch.matchId}-${matchKey}`}
              layout={layout}
              game={game}
              matchInfo={selectedMatch}
            />
          )}
        </Box>
      </Stack>

      <NewMatchDialog
        open={newMatchDialogOpen}
        onClose={() => setNewMatchDialogOpen(false)}
        onCreate={handleCreateMatch}
        configOptions={configInfo.configOptions}
        minPlayers={configInfo.minPlayers}
        maxPlayers={configInfo.maxPlayers}
        defaultPlayerCount={configInfo.defaultPlayerCount}
        defaultMatchOptions={configInfo.defaultMatchOptions}
      />

      <LoadStateDialog
        open={loadStateDialogOpen}
        onClose={() => setLoadStateDialogOpen(false)}
        onLoad={handleLoadState}
      />

      <ExportStateDialog
        open={exportStateDialogOpen}
        onClose={() => setExportStateDialogOpen(false)}
        matchInfo={selectedMatch ?? null}
        gameName={gameName}
      />
    </LoadingStateProvider>
  );
}
