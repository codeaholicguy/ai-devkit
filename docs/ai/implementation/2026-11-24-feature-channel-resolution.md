# Channel agent resolution implementation

The daemon owns registered identity and tmux target discovery. The CLI bridge consumes the daemon's lookup and live listing, and continues using its existing provider and terminal adapters.

The daemon advertises terminal lookup in daemon.status. The opt-in response identifies the tmux pane by ID after matching the live process's TTY. An unregistered agent can be resolved by its exact name and PID from the daemon list. Older legacy rows retain their tmux session reference on import.

The bridge polls for missing session metadata by PID. When a conversation file first appears after startup, the bridge relays messages timestamped from bridge startup onward. It validates liveness before writing text or keys. Status compares lookup against the bridge's recorded PID.
