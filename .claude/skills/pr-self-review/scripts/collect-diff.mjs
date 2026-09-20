#!/usr/bin/env node
// Prints { baseRef, base, head, fingerprint, files[], reviewFiles[] } for the local diff.
// Usage: node collect-diff.mjs [--base <ref>]
import { collectDiff, parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
console.log(JSON.stringify(collectDiff(args.base), null, 2));
