import { useEffect, useState, useRef } from 'react';

interface TerminalSize {
    cols: number;
    rows: number;
}

const RESIZE_DEBOUNCE_MS = 80;

function readSize(): TerminalSize {
    return {
        cols: process.stdout.columns ?? 120,
        rows: process.stdout.rows ?? 30,
    };
}

export function useTerminalSize(): TerminalSize {
    const [size, setSize] = useState<TerminalSize>(readSize);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const onResize = (): void => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                const next = readSize();
                setSize(prev => (prev.cols === next.cols && prev.rows === next.rows) ? prev : next);
            }, RESIZE_DEBOUNCE_MS);
        };
        process.stdout.on('resize', onResize);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            process.stdout.off('resize', onResize);
        };
    }, []);

    return size;
}
