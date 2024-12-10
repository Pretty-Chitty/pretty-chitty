import React, { ReactNode, useEffect } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { Stack, Box, Select, MenuItem, Paper } from '@mui/material';

export default function SelectableItemAndStage({
  items,
  render,
  keySpace,
  topOptions,
}: {
  items: string[];
  keySpace: string;
  render: (t: string) => ReactNode;
  topOptions?: ReactNode;
}) {
  const [selected, setSelected] = useLocalStorageState<string>(`dropdown${keySpace}`, {
    defaultValue: '',
  });

  useEffect(() => {
    if (selected === '' && items.length > 0) {
      setSelected(items[0]);
    }
  }, [selected, items, setSelected]);

  return (
    <Stack sx={{ height: '100%' }}>
      <Paper elevation={3} sx={{ position: 'relative' }}>
        <Stack direction="row">
          <Select
            variant="standard"
            sx={{ m: 2, width: 200 }}
            value={selected}
            label="Select Choice"
            onChange={(e) => setSelected(e.target.value)}
          >
            {items.map((item) => (
              <MenuItem value={item} key={item}>
                {item}
              </MenuItem>
            ))}
          </Select>
          {topOptions}
        </Stack>
      </Paper>
      <Box flexGrow={1}>{selected ? render(selected) : null}</Box>
    </Stack>
  );
}
