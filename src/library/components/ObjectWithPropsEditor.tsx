import React, { useEffect, useState } from "react";
import { TextField, Grid, Checkbox, FormControlLabel, Box, Paper, Typography } from "@mui/material";
import { ObjectWithProps } from "../utilities/ObjectWithProps";

function createEffectProps(obj: ObjectWithProps, entry: string, value: any) {
  return () => {
    if (obj.$internal_props.indexOf(entry) >= 0) {
      (obj as any)[entry] = value;
      obj.$internal_notifyChange(entry);
      obj.$internal_notifyChange("deserialized");
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

function ArrayPropEditor({ entry, obj }: { entry: string; obj: ObjectWithProps }) {
  const [value, setValue] = useState((obj as any)[entry]);

  const set = (val: string[]) => setValue(val);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(createEffectProps(obj, entry, value), [obj, entry, value]);

  return (
    <TextField
      fullWidth
      id={entry}
      label={entry}
      variant="standard"
      type="text"
      value={value.join(",") ?? ""}
      onChange={(e) => set(e.target.value.split(","))}
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
      obj.$internal_onChange(null, () => {
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
  if (Array.isArray(value)) {
    ComponentType = ArrayPropEditor;
  }

  if (ComponentType) {
    return <ComponentType entry={entry} obj={obj} />;
  }
  return null;
}

const defaultObjWithProps = new ObjectWithProps();

export default function ObjectWithPropsEditor({ obj }: { obj: ObjectWithProps }) {
  if (!obj) {
    obj = defaultObjWithProps;
  }

  const [targetType, setTargetType] = useState("");
  const [objProps, setObjProps] = useState<string[]>(obj.$internal_props);

  useEffect(() => {
    setObjProps(obj.$internal_props);
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
