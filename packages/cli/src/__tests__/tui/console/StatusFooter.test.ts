import React from 'react';
import { renderToString } from 'ink';
import { describe, expect, it } from 'vitest';
import { StatusFooter } from '../../../tui/console/StatusFooter.js';

describe('StatusFooter cached agent state', () => {
    it('describes cached rows as refreshing instead of live', () => {
        const output = renderToString(React.createElement(StatusFooter, {
            agents: [],
            lastUpdated: null,
            isLoading: true,
            isRefreshing: true,
            cachedAgentCount: 2,
            narrowNote: null,
            transient: null,
        }));

        expect(output).toContain('cached · refreshing live state…');
    });

    it('describes retained cached rows after refresh failure', () => {
        const output = renderToString(React.createElement(StatusFooter, {
            agents: [],
            lastUpdated: null,
            isLoading: false,
            isRefreshing: false,
            cachedAgentCount: 1,
            narrowNote: null,
            transient: null,
        }));

        expect(output).toContain('cached · refresh failed');
    });
});
