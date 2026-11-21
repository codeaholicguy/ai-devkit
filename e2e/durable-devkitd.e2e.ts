import { afterEach, describe, expect, it } from "vitest";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { DaemonClient } from "@ai-devkit/daemon-client";
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const binary = join(root, "rust/target/debug/devkitd");
const cli = join(root, "packages/cli/dist/bundle/cli.js");
let daemon: ChildProcess | undefined;
let directory: string | undefined;
let client: DaemonClient | undefined;
afterEach(async () => {
  client?.close();
  if (daemon && daemon.exitCode === null) {
    daemon.kill("SIGKILL");
    await new Promise((r) => daemon!.once("exit", r));
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe("durable CLI with real devkitd and fixture start-profile commands", () => {
  it("imports legacy identity and supports create/send/resume/session for all providers", async () => {
    directory = await mkdtemp(join(tmpdir(), "durable-e2e-"));
    await mkdir(join(directory, "bin"));
    const stub = `#!/usr/bin/env python3
import os,sys,json
p=os.path.basename(sys.argv[0]);a=sys.argv;prompt=sys.stdin.read()
sid='11111111-1111-4111-8111-111111111111'
if p=='claude':
 key='--session-id' if '--session-id' in a else '--resume';sid=a[a.index(key)+1]
 print(json.dumps({'type':'result','session_id':sid,'result':'reply:'+prompt}))
elif p=='codex':
 if 'resume' in a:sid=a[a.index('--json')+1]
 for e in [{'type':'thread.started','thread_id':sid},{'type':'item.completed','item':{'type':'agent_message','text':'reply:'+prompt}},{'type':'turn.completed'}]:print(json.dumps(e))
else:
 key='--session-id' if '--session-id' in a else '--session';sid=a[a.index(key)+1]
 for e in [{'type':'session','id':sid},{'type':'message_end','message':{'role':'assistant','content':'reply:'+prompt}},{'type':'agent_end'}]:print(json.dumps(e))
`;
    for (const provider of ["claude", "codex", "pi"]) {
      const file = join(directory, "bin", provider);
      await writeFile(file, stub);
      await chmod(file, 0o755);
    }
    const env = {
      ...process.env,
      HOME: directory,
      PATH: `${join(directory, "bin")}:${process.env.PATH}`,
      DEVKITD_BIN: binary,
      NO_COLOR: "1",
    };
    const repository = join(root, "packages/agent-manager/dist/index.js");
    const seeded = await exec(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {DurableAgentRepository} from ${JSON.stringify(repository)};const r=new DurableAgentRepository();console.log(JSON.stringify(await r.create({name:'legacy',cwd:process.cwd(),provider:'claude'})));`,
      ],
      { cwd: directory, env },
    );
    const legacy = JSON.parse(seeded.stdout);
    daemon = spawn(binary, ["serve"], { env, stdio: "ignore" });
    const sock = join(directory, ".ai-devkit/daemon.sock");
    for (let tries = 0; tries < 100; tries++) {
      client = (await DaemonClient.tryConnect(sock)) ?? undefined;
      if (client) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(client).toBeDefined();
    expect((await client!.showDurable(legacy.id))?.id).toBe(legacy.id);
    const run = async (args: string[]) =>
      (
        await exec(process.execPath, [cli, "agent", ...args], {
          cwd: directory,
          env,
          timeout: 15000,
        })
      ).stdout;
    for (const provider of ["claude", "codex", "pi"]) {
      await run(["start", "--mode", "durable", "--type", provider, "--name", `worker-${provider}`]);
      const entries = JSON.parse(await run(["list", "--json"]));
      const agent = entries.find((a: { name: string }) => a.name === `worker-${provider}`);
      expect(agent.mode).toBe("durable");
      expect(agent.state).toBe("ready");
      for (const prompt of ["first", "second"]) {
        const reply = JSON.parse(await run(["send", prompt, "--id", agent.id, "--json"]));
        expect(reply.response).toBe(`reply:${prompt}`);
        expect(reply.exitCode).toBe(0);
      }
      const detail = JSON.parse(await run(["session", "detail", "--id", agent.id, "--json"]));
      expect(detail.lastResult.status).toBe("succeeded");
      const sessions = JSON.parse(await run(["sessions", "--all", "--json"]));
      expect(sessions).toContainEqual(
        expect.objectContaining({
          durableId: agent.id,
          mode: "durable",
          sessionId: detail.providerSessionId,
        }),
      );
    }
  });
});
