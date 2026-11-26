# Channel agent resolution requirements

Channel start resolves registered agents through devkitd and preserves case-insensitive live name matching. Both foreground and detached bridges deliver messages and interactive replies to the agent's exact tmux pane. Outbound conversation polling works when discovery trails registration.

Legacy and daemon-started registrations are supported. A dead registration remains visible in status and the bridge replies to inbound messages that the agent has exited. Status reports agent liveness independently of bridge process liveness.

The existing local path supports old or absent daemons. GUI terminal discovery remains available and Herdr delivery is outside scope. The bridge registry format stays as shipped.
