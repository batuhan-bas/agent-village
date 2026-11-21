// The example hook files must forward every event the app reacts to; without SessionEnd (Claude)
// a finished session never frees its ninja, and after a dozen sessions new agents get none.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const NEED = {
  "hooks/claude-settings.example.json": ["PreToolUse", "PostToolUseFailure", "SubagentStart", "SubagentStop", "Stop", "SessionEnd"],
  "hooks/codex-hooks.example.json": ["PreToolUse", "SubagentStart", "SubagentStop", "Stop", "SessionEnd"],
};
for (const [file, events] of Object.entries(NEED)) {
  const hooks = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url))).hooks;
  for (const ev of events) assert.ok(JSON.stringify(hooks[ev] || []).includes("127.0.0.1:4343/event"), `${file}: no ${ev} hook`);
}
console.log("hook examples ok");
