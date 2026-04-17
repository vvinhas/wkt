export interface FlagSchema {
  name: string;
  type: "string" | "boolean" | "string[]";
  required: boolean;
}

export type ParsedFlags = Record<string, string | boolean | string[] | undefined>;

const IGNORED_FLAGS = new Set(["--json", "--help"]);

export function parseFlags(argv: string[], schema: FlagSchema[]): ParsedFlags {
  const result: ParsedFlags = {};
  const schemaMap = new Map(schema.map((s) => [s.name, s]));

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (IGNORED_FLAGS.has(arg)) {
      i++;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const eqIdx = arg.indexOf("=");
    let key: string;
    let inlineValue: string | undefined;

    if (eqIdx !== -1) {
      key = arg.slice(2, eqIdx);
      inlineValue = arg.slice(eqIdx + 1);
    } else {
      key = arg.slice(2);
    }

    const def = schemaMap.get(key);
    if (!def) throw new Error(`Unknown flag: --${key}`);

    if (def.type === "boolean") {
      result[key] = true;
      i++;
    } else {
      let value: string;
      if (inlineValue !== undefined) {
        value = inlineValue;
        i++;
      } else {
        i++;
        const next = argv[i];
        if (next === undefined || next.startsWith("--")) {
          throw new Error(`Flag --${key} requires a value`);
        }
        value = next;
        i++;
      }

      if (def.type === "string[]") {
        result[key] = value.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        result[key] = value;
      }
    }
  }

  for (const def of schema) {
    if (result[def.name] === undefined) {
      if (def.required) throw new Error(`Missing required flag: --${def.name}`);
      if (def.type === "boolean") result[def.name] = false;
    }
  }

  return result;
}

export function hasFlags(argv: string[]): boolean {
  return argv.some((a) => a.startsWith("--") && !IGNORED_FLAGS.has(a));
}

export interface GlobalFlagSchema {
  name: string;
  type: "string" | "boolean";
}

export interface ExtractedFlags {
  values: Record<string, string | boolean | undefined>;
  rest: string[];
}

export function extractGlobalFlags(argv: string[], schema: GlobalFlagSchema[]): ExtractedFlags {
  const values: Record<string, string | boolean | undefined> = {};
  const schemaMap = new Map(schema.map((s) => [s.name, s]));
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    const eqIdx = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const key = eqIdx !== -1 ? arg.slice(2, eqIdx) : arg.startsWith("--") ? arg.slice(2) : undefined;
    const def = key ? schemaMap.get(key) : undefined;

    if (!def) {
      rest.push(arg);
      continue;
    }

    if (def.type === "boolean") {
      values[def.name] = true;
    } else if (eqIdx !== -1) {
      values[def.name] = arg.slice(eqIdx + 1);
    } else {
      values[def.name] = argv[++i];
    }
  }

  return { values, rest };
}
