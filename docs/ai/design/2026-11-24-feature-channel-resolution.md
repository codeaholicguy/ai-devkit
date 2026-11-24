# Channel agent resolution design

Use capability-gated terminal resolution on agent.lookup. Combine the selected registration with agent.list conversation metadata by PID. A bridge can start before the enriched cache catches up and retry metadata discovery while polling. The daemon matches the live agent TTY to the exact tmux pane. The bridge still owns terminal writes and provider adapters.

Check agent liveness for inbound delivery and report dead targets on the authorized channel. Use lookup for agent liveness in status and compare against the bridge's recorded PID.
