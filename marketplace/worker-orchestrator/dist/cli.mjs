#!/usr/bin/env node
import { main } from '../lib/cli/main.mjs';
process.exitCode = main(undefined, "0.1.6");
