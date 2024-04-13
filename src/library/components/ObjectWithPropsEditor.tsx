import React, { useEffect, useState } from "react";
import { TextField, Grid, Checkbox, FormControlLabel, Box, Paper, Typography } from "@mui/material";
import { ObjectWithProps } from "../utilities/ObjectWithProps";

function createEffectProps(obj: ObjectWithProps, entry: string, value: any) {
  return () => {
    if (obj.props.indexOf(entry) >= 0) {
      (obj as any)[entry] = value;
      obj.notifyChange(entry);
      obj.notifyChange("deserialized");
    }
  };
}

function TextPropEditor({ entry, obj }: { entry: string; obj: ObjectWithProps }) {
  const [value, setValue] = useState((obj as any)[entry]);

  const set = (val: string) => setValue(val);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(createEffectProps(obj, entry, value), [obj, entry, value]);

  return (
    <TextField
      fullWidth
      id={entry}
      label={entry}
      variant="standard"
      type="text"
      value={value ?? ""}
      onChange={(e) => set(e.target.value)}
    />
  );
}

function NumberPropEditor({ entry, obj }: { entry: string; obj: ObjectWithProps }) {
  const [value, setValue] = useState((obj as any)[entry]);
  const set = (val: number) => setValue(val);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(createEffectProps(obj, entry, value), [createEffectProps, obj, entry, value]);

  return (
    <TextField
      fullWidth
      id={entry}
      label={entry}
      variant="standard"
      type="number"
      value={value ?? ""}
      onChange={(e) => set(+e.target.value)}
    />
  );
}

function BooleanPropEditor({ entry, obj }: { entry: string; obj: ObjectWithProps }) {
  const [value, setValue] = useState((obj as any)[entry] ?? false);
  const set = (val: boolean) => setValue(val);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(createEffectProps(obj, entry, value), [obj, entry, value]);

  return (
    <FormControlLabel control={<Checkbox checked={value} onChange={(e) => set(e.target.checked)} />} label={entry} />
  );
}

function SubObjectPropEditor({ entry, obj }: { entry: string; obj: ObjectWithProps }) {
  const value = (obj as any)[entry];

  return (
    <Box>
      <Typography>{entry}</Typography>
      <Box>
        <Paper sx={{ p: 2 }} elevation={3}>
          <ObjectWithPropsEditor obj={value} />
        </Paper>
      </Box>
    </Box>
  );
}

function PropEditor({ entry, obj }: { entry: string; obj: ObjectWithProps }) {
  const [value, setValue] = useState((obj as any)[entry]);
  useEffect(
    () =>
      obj.onChange(null, () => {
        setValue((obj as any)[entry]);
      }),
    [obj, setValue, entry],
  );

  let ComponentType: undefined | (({ entry, obj }: { entry: string; obj: ObjectWithProps }) => JSX.Element);

  if (typeof value === "number") {
    ComponentType = NumberPropEditor;
  }
  if (typeof value === "string") {
    ComponentType = TextPropEditor;
  }
  if (typeof value === "boolean") {
    ComponentType = BooleanPropEditor;
  }
  if (entry !== "parent" && value instanceof ObjectWithProps) {
    ComponentType = SubObjectPropEditor;
  }

  if (ComponentType) {
    return <ComponentType entry={entry} obj={obj} />;
  }
  return null;
}

export default function ObjectWithPropsEditor({ obj }: { obj: ObjectWithProps }) {
  if (!obj) {
    obj = new ObjectWithProps();
  }

  const [targetType, setTargetType] = useState("");
  const [objProps, setObjProps] = useState<string[]>(obj.props);

  useEffect(() => {
    setObjProps(obj.props);
    const proto = Object.getPrototypeOf(obj);
    const constructor = proto.constructor;
    const keySpace = constructor.name;
    setTargetType(keySpace);
  }, [obj]);

  return (
    <>
      {[targetType].map((c) => (
        <Grid key={c} container spacing={3}>
          {objProps.map((entry) => (
            <Grid key={entry} item xs={12}>
              <PropEditor obj={obj} entry={entry} />
            </Grid>
          ))}
        </Grid>
      ))}
    </>
  );
}
