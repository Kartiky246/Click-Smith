#!/usr/bin/env node
// A deterministic fake coding agent for tests. It runs inside the run sandbox
// (its cwd), makes a small edit so a real diff is produced, and prints a plan.
import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';

const [bundlePath, targetFile = 'change.txt', mode = 'create'] = process.argv.slice(2);

let prompt = '(unknown)';
try {
  prompt = JSON.parse(readFileSync(bundlePath, 'utf8')).prompt;
} catch {
  // bundle not provided / unreadable — keep going, this is a fake agent.
}

if (mode === 'append' && existsSync(targetFile)) {
  appendFileSync(targetFile, `agent-appended for: ${prompt}\n`);
} else {
  writeFileSync(targetFile, `agent change for: ${prompt}\n`);
}

console.log('## Plan');
console.log(`Edited ${targetFile} per request: ${prompt}`);
