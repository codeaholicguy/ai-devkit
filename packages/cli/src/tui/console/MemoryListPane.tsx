import React from 'react';
import { Box, Text } from 'ink';
import { truncate } from '../../util/text.js';
import { Panel, SectionTitle, TUI_COLORS } from '../design-system/index.js';
import { formatRelative } from './render/formatRelative.js';
import { useMemoryList } from './hooks/useMemoryList.js';
import type { ConsoleMemoryItem } from './types.js';

interface MemoryListPaneProps {
    width: number;
    height: number;
}

export interface MemoryListRow {
    title: string;
    meta: string;
}

export type MemoryListDisplayState = 'loading' | 'error' | 'empty' | 'items';

export function getMemoryListDisplayState(input: {
    isLoading: boolean;
    error: string | null;
    rowCount: number;
}): MemoryListDisplayState {
    if (input.isLoading) return 'loading';
    if (input.error) return 'error';
    if (input.rowCount === 0) return 'empty';
    return 'items';
}

export function getMemoryListStatusText(input: {
    displayState: MemoryListDisplayState;
    error: string | null;
    width: number;
}): string | null {
    if (input.displayState === 'loading') return 'loading...';
    if (input.displayState === 'error') return truncate(input.error ?? 'Could not load memory.', input.width);
    if (input.displayState === 'empty') return 'No memory items yet.';
    return null;
}

function formatUpdatedDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString().slice(0, 10);
}

function buildMeta(item: ConsoleMemoryItem): string {
    const tags = item.tags.length > 0 ? item.tags.join(', ') : 'untagged';
    return `${item.scope} · ${tags} · ${formatUpdatedDate(item.updatedAt)}`;
}

export function getVisibleMemoryItems(items: ConsoleMemoryItem[], height: number): ConsoleMemoryItem[] {
    const rowBudget = Math.max(0, Math.floor((height - 3) / 2));
    return items.slice(0, rowBudget);
}

export function getHiddenMemoryCount(total: number, visibleCount: number): number {
    return Math.max(0, total - visibleCount);
}

export function getMemoryListRows(items: ConsoleMemoryItem[], width: number): MemoryListRow[] {
    const contentWidth = Math.max(4, width);
    return items.map(item => ({
        title: truncate(item.title, contentWidth),
        meta: truncate(buildMeta(item), contentWidth),
    }));
}

export const MemoryListPane: React.FC<MemoryListPaneProps> = ({ width, height }) => {
    const { items, total, isLoading, error, lastUpdated } = useMemoryList();
    const innerWidth = Math.max(4, width - 4);
    const visibleItems = getVisibleMemoryItems(items, height - 2);
    const rows = getMemoryListRows(visibleItems, innerWidth);
    const hiddenCount = getHiddenMemoryCount(total, visibleItems.length);
    const displayState = getMemoryListDisplayState({ isLoading, error, rowCount: rows.length });
    const statusText = getMemoryListStatusText({ displayState, error, width: innerWidth });

    return (
        <Panel
            width={width}
            height={height}
            focused
            paddingX={1}
            flexDirection="column"
            flexShrink={0}
        >
            <Box>
                <SectionTitle>MEMORY</SectionTitle>
                <Text dimColor> · recent</Text>
                {lastUpdated ? (
                    <>
                        <Text dimColor> · </Text>
                        <Text dimColor>updated {formatRelative(lastUpdated)}</Text>
                    </>
                ) : null}
            </Box>

            <Box flexDirection="column" marginTop={1}>
                {displayState === 'loading' ? (
                    <Text dimColor>{statusText}</Text>
                ) : displayState === 'error' ? (
                    <Text color={TUI_COLORS.danger}>{statusText}</Text>
                ) : displayState === 'empty' ? (
                    <Text dimColor>{statusText}</Text>
                ) : (
                    rows.map((row, index) => (
                        <Box key={`${visibleItems[index]?.id ?? index}`} flexDirection="column" marginBottom={1}>
                            <Text>{row.title}</Text>
                            <Text dimColor>{row.meta}</Text>
                        </Box>
                    ))
                )}
            </Box>

            {!isLoading && !error && hiddenCount > 0 ? (
                <Box marginTop={1}>
                    <Text color={TUI_COLORS.accent}>+{hiddenCount} more</Text>
                </Box>
            ) : null}
        </Panel>
    );
};
