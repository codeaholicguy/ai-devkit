#!/usr/bin/env node
import * as nodeModule from "node:module";

// Enable the V8 compile cache (Node >= 22.8) before loading the program so
// repeat invocations skip re-compiling the module graph.
(nodeModule as { enableCompileCache?: () => void }).enableCompileCache?.();

await import("./main.js");
