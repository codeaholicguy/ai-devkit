import { describe, it, expect } from 'vitest';
// computeLayout is a pure function exported from ConsoleApp — import only the function,
// not the React component tree, to avoid JSX in the test environment.
import { computeLayout } from '../../../tui/console/ConsoleApp.js';

// Constants mirrored from ConsoleApp.tsx for assertions
const LIST_PANE_WIDTH = 48;
const MIN_CONTENT_HEIGHT = 12;
const INPUT_BOX_CHROME_ROWS = 2;

describe('computeLayout', () => {
    describe('wide mode (narrow=false)', () => {
        it('uses fixed LIST_PANE_WIDTH', () => {
            const layout = computeLayout(160, 40, 1, false);
            expect(layout.listPaneWidth).toBe(LIST_PANE_WIDTH);
        });

        it('right col fills remaining space minus separator', () => {
            const layout = computeLayout(160, 40, 1, false);
            expect(layout.rightColWidth).toBe(160 - LIST_PANE_WIDTH - 1);
        });

        it('inputInnerWidth is rightColWidth minus 4 (border + padding)', () => {
            const layout = computeLayout(160, 40, 1, false);
            expect(layout.inputInnerWidth).toBe(layout.rightColWidth - 4);
        });

        it('previewHeight is contentHeight minus inputBoxHeight', () => {
            const layout = computeLayout(160, 40, 1, false);
            expect(layout.previewHeight).toBe(layout.contentHeight - layout.inputBoxHeight);
        });

        it('inputBoxHeight grows with inputLines', () => {
            const single = computeLayout(160, 40, 1, false);
            const triple = computeLayout(160, 40, 3, false);
            expect(triple.inputBoxHeight).toBe(single.inputBoxHeight + 2);
        });
    });

    describe('narrow mode (narrow=true)', () => {
        it('list pane is cols − 2', () => {
            const layout = computeLayout(80, 30, 1, true);
            expect(layout.listPaneWidth).toBe(78);
        });
    });

    describe('contentHeight floor', () => {
        it('never goes below MIN_CONTENT_HEIGHT', () => {
            // Very small terminal
            const layout = computeLayout(40, 1, 1, true);
            expect(layout.contentHeight).toBeGreaterThanOrEqual(MIN_CONTENT_HEIGHT);
        });
    });

    describe('inputBoxHeight', () => {
        it('is inputLines + INPUT_BOX_CHROME_ROWS', () => {
            expect(computeLayout(160, 40, 1, false).inputBoxHeight).toBe(1 + INPUT_BOX_CHROME_ROWS);
            expect(computeLayout(160, 40, 4, false).inputBoxHeight).toBe(4 + INPUT_BOX_CHROME_ROWS);
        });
    });

    describe('minimum right col width', () => {
        it('clamps rightColWidth to 20 on very narrow terminal', () => {
            // cols=50: 50 - 48 - 1 = 1, clamped to 20
            const layout = computeLayout(50, 30, 1, false);
            expect(layout.rightColWidth).toBe(20);
        });

        it('clamps inputInnerWidth to 4 minimum', () => {
            const layout = computeLayout(50, 30, 1, false);
            // rightColWidth=20, 20-4=16; but if clamped rightCol is exactly 20, inner is 16
            expect(layout.inputInnerWidth).toBeGreaterThanOrEqual(4);
        });
    });
});
