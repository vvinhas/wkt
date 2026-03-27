#!/usr/bin/env bun
import { add } from "./commands/add.ts";
import { remove } from "./commands/remove.ts";
import { use } from "./commands/use.ts";
import { config } from "./commands/config.ts";
import { list } from "./commands/list.ts";
import { clear } from "./commands/clear.ts";
import { help } from "./commands/help.ts";
import { setJsonMode } from "./lib/output.ts";

const args = process.argv.slice(2);

if (args.includes("--json")) {
  setJsonMode(true);
}

const command = args.find((a) => !a.startsWith("--"));
const commandArgs = args.filter((a) => a !== command && a !== "--json");

switch (command) {
  case "add":
    await add(commandArgs);
    break;
  case "remove":
    await remove(commandArgs);
    break;
  case "use":
    await use(commandArgs);
    break;
  case "config":
    await config(commandArgs);
    break;
  case "list":
    await list(commandArgs);
    break;
  case "clear":
    await clear(commandArgs);
    break;
  case "help":
  case "-h":
    help();
    break;
  default:
    if (command) {
      console.error(`Unknown command: ${command}\n`);
    }
    help();
    break;
}
