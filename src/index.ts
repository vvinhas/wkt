import { add } from "./commands/add.ts";
import { remove } from "./commands/remove.ts";
import { use } from "./commands/use.ts";
import { config } from "./commands/config.ts";
import { list } from "./commands/list.ts";
import { help } from "./commands/help.ts";
import { setJsonMode } from "./lib/output.ts";

if (process.argv.includes("--json")) {
  setJsonMode(true);
}

const command = process.argv[2];

switch (command) {
  case "add":
    await add();
    break;
  case "remove":
    await remove();
    break;
  case "use":
    await use();
    break;
  case "config":
    await config();
    break;
  case "list":
    await list();
    break;
  case "help":
  case "--help":
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
