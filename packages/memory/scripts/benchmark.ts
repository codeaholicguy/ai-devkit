#!/usr/bin/env node
/**
 * Performance Benchmark Script for Memory Service
 *
 * Tests the store and search functions against defined SLAs:
 * - Storage latency: < 100ms
 * - Search latency: < 50ms (< 1000 items)
 * - Cold start time: < 500ms
 * - Memory footprint: < 100MB
 * - Database size: < 50MB per 10,000 items
 *
 * Usage:
 *   npm run benchmark
 *   npx ts-node --swc scripts/benchmark.ts [options]
 *
 * Options:
 *   --items=<n>     Number of items to store (default: 5000)
 *   --searches=<n>  Number of search operations (default: 300)
 *   --verbose       Show detailed output
 *   --help          Show this help message
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { storeKnowledge, searchKnowledge } from '../src/api';
import { getDatabase, closeDatabase } from '../src/database';
import type { StoreKnowledgeInput, SearchKnowledgeInput } from '../src/types';

// SLA Definitions
const SLA = {
    STORE_LATENCY_MS: 100,
    SEARCH_LATENCY_MS: 50,
    COLD_START_MS: 500,
    MEMORY_FOOTPRINT_MB: 100,
    DATABASE_SIZE_MB_PER_10K: 50,
};

// Configuration
interface BenchmarkConfig {
    numItems: number;
    numSearches: number;
    verbose: boolean;
}

function parseArgs(): BenchmarkConfig {
    const args = process.argv.slice(2);
    const config: BenchmarkConfig = {
        numItems: 5000,
        numSearches: 300,
        verbose: false,
    };

    for (const arg of args) {
        if (arg === '--help') {
            console.log(`
Performance Benchmark Script for Memory Service

Usage:
  npm run benchmark
  npx ts-node --swc scripts/benchmark.ts [options]

Options:
  --items=<n>     Number of items to store (default: 5000)
  --searches=<n>  Number of search operations (default: 300)
  --verbose       Show detailed output
  --help          Show this help message

SLA Targets:
  - Storage latency:   < 100ms
  - Search latency:    < 50ms (< 1000 items)
  - Cold start time:   < 500ms
  - Memory footprint:  < 100MB
  - Database size:     < 50MB per 10,000 items
`);
            process.exit(0);
        }
        if (arg.startsWith('--items=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!isNaN(val) && val > 0) config.numItems = val;
        }
        if (arg.startsWith('--searches=')) {
            const val = parseInt(arg.split('=')[1], 10);
            if (!isNaN(val) && val > 0) config.numSearches = val;
        }
        if (arg === '--verbose') {
            config.verbose = true;
        }
    }

    return config;
}

// Data Generation
const SAMPLE_TITLES = [
    'API Design Best Practices for REST Services',
    'Authentication Flow Implementation Guidelines',
    'Database Schema Migration Strategy',
    'Error Handling Patterns in TypeScript',
    'Frontend Component Architecture Decisions',
    'Git Branching Strategy for Feature Development',
    'HTTP Request Retry Logic Implementation',
    'Input Validation Rules for User Forms',
    'JSON Schema Design for API Responses',
    'Kubernetes Deployment Configuration',
    'Logging Standards for Microservices',
    'Memory Management in Node.js Applications',
    'Naming Conventions for Variables and Functions',
    'OAuth Token Refresh Implementation',
    'Performance Optimization for Database Queries',
    'Queue Processing Error Recovery Strategy',
    'Rate Limiting Implementation Details',
    'Security Headers Configuration',
    'Testing Strategy for Integration Tests',
    'User Session Management Approach',
];

const SAMPLE_TAGS = [
    'api', 'backend', 'frontend', 'database', 'security',
    'performance', 'testing', 'devops', 'architecture', 'typescript',
    'node', 'react', 'docker', 'kubernetes', 'authentication',
    'authorization', 'caching', 'logging', 'monitoring', 'deployment',
];

const SAMPLE_SCOPES = [
    'global',
    'project:webapp',
    'project:api-service',
    'project:mobile-app',
    'repo:frontend',
    'repo:backend',
];

const CONTENT_TEMPLATES = {
    small: (topic: string, id: number) => `## ${topic}
Quick note: Always validate input for item ${id} before processing.
\`\`\`typescript
const validate = (input: unknown) => schema.parse(input);
\`\`\``,

    medium: (topic: string, id: number) => `## ${topic} - Implementation Notes

### Context
This covers the approach for ${topic} (item ${id}).

### Key Points
1. Validate all inputs
2. Handle errors gracefully
3. Log important events
4. Monitor performance

### Example
\`\`\`typescript
function process${id}(data: Input): Output {
  validate(data);
  const result = transform(data);
  logger.info('Processed', { id: ${id} });
  return result;
}
\`\`\`

### See Also
- Related documentation
- External references`,

    large: (topic: string, id: number) => `# Comprehensive Guide: ${topic}

## Executive Summary
This document provides a comprehensive guide to ${topic} for our development team.

## Implementation Guidelines

### Core Principles
1. **Simplicity First**: Start with the simplest solution that could work
2. **Incremental Enhancement**: Add complexity only when needed
3. **Measurable Outcomes**: Every change should be measurable

### Code Pattern
\`\`\`typescript
interface Config {
  enabled: boolean;
  timeout: number;
  retries: number;
}

class Handler${id} {
  constructor(private config: Config) {}
  
  async execute(): Promise<void> {
    for (let i = 0; i < this.config.retries; i++) {
      try {
        await this.doWork();
        return;
      } catch (error) {
        if (i === this.config.retries - 1) throw error;
        await this.delay(Math.pow(2, i) * 1000);
      }
    }
  }
  
  private async doWork(): Promise<void> {
    // Implementation
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
\`\`\`

## Testing Strategy
- Test individual functions in isolation
- Mock external dependencies
- Aim for 80%+ coverage

## References
- Internal wiki documentation
- External best practice guides`,
};

function generateTestData(numItems: number): StoreKnowledgeInput[] {
    const items: StoreKnowledgeInput[] = [];

    for (let i = 0; i < numItems; i++) {
        const titleBase = SAMPLE_TITLES[i % SAMPLE_TITLES.length];
        const title = `${titleBase} - Variant ${i + 1}`;
        const topicName = titleBase.split(' ').slice(0, 3).join(' ');

        // Vary content sizes: ~30% small, ~50% medium, ~20% large
        let content: string;
        const sizeRoll = i % 10;

        if (sizeRoll < 3) {
            content = CONTENT_TEMPLATES.small(topicName, i + 1);
        } else if (sizeRoll < 8) {
            content = CONTENT_TEMPLATES.medium(topicName, i + 1);
        } else {
            content = CONTENT_TEMPLATES.large(topicName, i + 1);
        }

        const numTags = 1 + (i % 5);
        const tags: string[] = [];
        for (let j = 0; j < numTags; j++) {
            tags.push(SAMPLE_TAGS[(i + j) % SAMPLE_TAGS.length]);
        }

        const scope = SAMPLE_SCOPES[i % SAMPLE_SCOPES.length];
        items.push({ title, content, tags, scope });
    }

    return items;
}

function generateSearchQueries(numSearches: number): SearchKnowledgeInput[] {
    const queries: SearchKnowledgeInput[] = [];
    const searchTerms = [
        'API design best practices',
        'authentication flow',
        'database migration',
        'error handling',
        'component architecture',
        'git branching',
        'retry logic',
        'input validation',
        'deployment configuration',
        'performance optimization',
    ];

    for (let i = 0; i < numSearches; i++) {
        const query = searchTerms[i % searchTerms.length];
        const numTags = i % 3;
        const contextTags: string[] = [];
        for (let j = 0; j < numTags; j++) {
            contextTags.push(SAMPLE_TAGS[(i + j) % SAMPLE_TAGS.length]);
        }

        queries.push({
            query,
            contextTags: contextTags.length > 0 ? contextTags : undefined,
            scope: i % 3 === 0 ? SAMPLE_SCOPES[i % SAMPLE_SCOPES.length] : undefined,
            limit: 5,
        });
    }

    return queries;
}

// Benchmark Utilities
interface BenchmarkResult {
    operation: string;
    count: number;
    totalTimeMs: number;
    avgTimeMs: number;
    minTimeMs: number;
    maxTimeMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    slaMaxMs: number;
    slaPassed: boolean;
    slaViolations: number;
}

function calculatePercentile(sortedLatencies: number[], percentile: number): number {
    if (sortedLatencies.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedLatencies.length) - 1;
    return sortedLatencies[Math.max(0, index)];
}

function analyzeBenchmarkResults(
    operation: string,
    latencies: number[],
    slaMaxMs: number
): BenchmarkResult {
    if (latencies.length === 0) {
        return {
            operation,
            count: 0,
            totalTimeMs: 0,
            avgTimeMs: 0,
            minTimeMs: 0,
            maxTimeMs: 0,
            p50Ms: 0,
            p95Ms: 0,
            p99Ms: 0,
            slaMaxMs,
            slaPassed: true,
            slaViolations: 0,
        };
    }

    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const slaViolations = latencies.filter((l) => l > slaMaxMs).length;

    return {
        operation,
        count: latencies.length,
        totalTimeMs: latencies.reduce((a, b) => a + b, 0),
        avgTimeMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        minTimeMs: sortedLatencies[0],
        maxTimeMs: sortedLatencies[sortedLatencies.length - 1],
        p50Ms: calculatePercentile(sortedLatencies, 50),
        p95Ms: calculatePercentile(sortedLatencies, 95),
        p99Ms: calculatePercentile(sortedLatencies, 99),
        slaMaxMs,
        slaPassed: slaViolations === 0,
        slaViolations,
    };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getMemoryUsageMB(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / (1024 * 1024);
}

function getDbPaths(dbPath: string): { main: string; wal: string; shm: string } {
    return {
        main: dbPath,
        wal: dbPath + '-wal',
        shm: dbPath + '-shm',
    };
}

function getDatabaseSizeBytes(dbPath: string): number {
    let totalSize = 0;
    const paths = getDbPaths(dbPath);
    try {
        if (fs.existsSync(paths.main)) totalSize += fs.statSync(paths.main).size;
        if (fs.existsSync(paths.wal)) totalSize += fs.statSync(paths.wal).size;
        if (fs.existsSync(paths.shm)) totalSize += fs.statSync(paths.shm).size;
    } catch {
        // Ignore errors
    }
    return totalSize;
}

function cleanupDbFiles(dbPath: string): void {
    const paths = getDbPaths(dbPath);
    try {
        if (fs.existsSync(paths.main)) fs.unlinkSync(paths.main);
        if (fs.existsSync(paths.wal)) fs.unlinkSync(paths.wal);
        if (fs.existsSync(paths.shm)) fs.unlinkSync(paths.shm);
    } catch {
        // Ignore errors
    }
}

// Benchmark Database Management
let benchmarkDbPath: string | null = null;

function getBenchmarkDatabase() {
    if (!benchmarkDbPath) {
        throw new Error('Benchmark database path not set');
    }
    return getDatabase({ dbPath: benchmarkDbPath });
}

// Benchmark Tests
async function benchmarkColdStart(dbPath: string): Promise<{ latencyMs: number; passed: boolean }> {
    closeDatabase();
    cleanupDbFiles(dbPath);
    benchmarkDbPath = dbPath;

    const startTime = performance.now();
    getBenchmarkDatabase();
    const latencyMs = performance.now() - startTime;

    return {
        latencyMs,
        passed: latencyMs < SLA.COLD_START_MS,
    };
}

function benchmarkStore(items: StoreKnowledgeInput[], verbose: boolean): BenchmarkResult {
    const latencies: number[] = [];
    let successCount = 0;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const startTime = performance.now();

        try {
            storeKnowledge(item);
            successCount++;
        } catch (error) {
            if (!(error instanceof Error && error.message.includes('Duplicate'))) {
                if (verbose) console.error(`  Error storing item ${i + 1}: ${error}`);
            }
        }

        latencies.push(performance.now() - startTime);

        if (verbose && (i + 1) % 500 === 0) {
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            console.log(`  Stored ${i + 1}/${items.length} items (avg: ${avg.toFixed(2)}ms)`);
        }
    }

    if (verbose) console.log(`  Completed: ${successCount} stored`);

    return analyzeBenchmarkResults('Store', latencies, SLA.STORE_LATENCY_MS);
}

function benchmarkSearch(queries: SearchKnowledgeInput[], verbose: boolean): BenchmarkResult {
    const latencies: number[] = [];
    let totalResults = 0;

    for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        const startTime = performance.now();

        try {
            const result = searchKnowledge(query);
            totalResults += result.results.length;
        } catch (error) {
            if (verbose) console.error(`  Error searching query ${i + 1}: ${error}`);
        }

        latencies.push(performance.now() - startTime);

        if (verbose && (i + 1) % 100 === 0) {
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            console.log(`  Executed ${i + 1}/${queries.length} searches (avg: ${avg.toFixed(2)}ms)`);
        }
    }

    if (verbose) console.log(`  Total results returned: ${totalResults}`);

    return analyzeBenchmarkResults('Search', latencies, SLA.SEARCH_LATENCY_MS);
}

interface MixedWorkloadResult {
    storeResult: BenchmarkResult;
    searchResult: BenchmarkResult;
    totalOperations: number;
    throughputOpsPerSec: number;
}

function benchmarkMixedWorkload(
    items: StoreKnowledgeInput[],
    queries: SearchKnowledgeInput[],
    verbose: boolean
): MixedWorkloadResult {
    const storeLatencies: number[] = [];
    const searchLatencies: number[] = [];

    // Build mixed operation sequence: 80% search, 20% store
    const operations: ('store' | 'search')[] = [];
    const storeCount = items.length;
    const searchCount = Math.max(queries.length, storeCount * 4);

    let storeIdx = 0;
    let searchIdx = 0;

    while (storeIdx < storeCount || searchIdx < searchCount) {
        const shouldSearch = Math.random() < 0.8;

        if (shouldSearch && searchIdx < searchCount) {
            operations.push('search');
            searchIdx++;
        } else if (storeIdx < storeCount) {
            operations.push('store');
            storeIdx++;
        } else if (searchIdx < searchCount) {
            operations.push('search');
            searchIdx++;
        }
    }

    storeIdx = 0;
    searchIdx = 0;

    const totalStartTime = performance.now();

    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];

        if (op === 'store' && storeIdx < items.length) {
            const startTime = performance.now();
            try {
                storeKnowledge(items[storeIdx]);
            } catch {
                // Ignore duplicate errors
            }
            storeLatencies.push(performance.now() - startTime);
            storeIdx++;
        } else if (op === 'search') {
            const query = queries[searchIdx % queries.length];
            const startTime = performance.now();
            try {
                searchKnowledge(query);
            } catch {
                // Ignore errors
            }
            searchLatencies.push(performance.now() - startTime);
            searchIdx++;
        }

        if (verbose && (i + 1) % 500 === 0) {
            console.log(`  Completed ${i + 1}/${operations.length} operations...`);
        }
    }

    const totalTimeMs = performance.now() - totalStartTime;
    const totalOperations = operations.length;
    const throughputOpsPerSec = (totalOperations / totalTimeMs) * 1000;

    return {
        storeResult: analyzeBenchmarkResults('Mixed Store', storeLatencies, SLA.STORE_LATENCY_MS),
        searchResult: analyzeBenchmarkResults('Mixed Search', searchLatencies, SLA.SEARCH_LATENCY_MS),
        totalOperations,
        throughputOpsPerSec,
    };
}

// Report Generation
function printHeader(title: string): void {
    console.log('\n' + '='.repeat(70));
    console.log(` ${title}`);
    console.log('='.repeat(70));
}

function printSeparator(): void {
    console.log('-'.repeat(70));
}

function printResult(result: BenchmarkResult): void {
    const status = result.slaPassed ? 'PASSED' : 'FAILED';

    console.log(`\n${result.operation} Benchmark Results:`);
    printSeparator();
    console.log(`  Operations:     ${result.count}`);
    console.log(`  Total Time:     ${result.totalTimeMs.toFixed(2)}ms`);
    console.log(`  Average:        ${result.avgTimeMs.toFixed(2)}ms`);
    console.log(`  Min:            ${result.minTimeMs.toFixed(2)}ms`);
    console.log(`  Max:            ${result.maxTimeMs.toFixed(2)}ms`);
    console.log(`  P50:            ${result.p50Ms.toFixed(2)}ms`);
    console.log(`  P95:            ${result.p95Ms.toFixed(2)}ms`);
    console.log(`  P99:            ${result.p99Ms.toFixed(2)}ms`);
    printSeparator();
    console.log(`  SLA Target:     < ${result.slaMaxMs}ms`);
    console.log(`  SLA Status:     ${status}`);
    if (!result.slaPassed) {
        const pct = ((result.slaViolations / result.count) * 100).toFixed(2);
        console.log(`  Violations:     ${result.slaViolations} (${pct}%)`);
    }
}

function printSummary(
    config: BenchmarkConfig,
    coldStart: { latencyMs: number; passed: boolean },
    storeResult: BenchmarkResult,
    searchResult: BenchmarkResult,
    mixedResult: MixedWorkloadResult,
    memoryUsageMB: number,
    dbSizeBytes: number
): void {
    printHeader('BENCHMARK SUMMARY');

    const dbSizeMB = dbSizeBytes / (1024 * 1024);
    const expectedDbSizeMB = (config.numItems / 10000) * SLA.DATABASE_SIZE_MB_PER_10K;
    const dbSizePassed = dbSizeMB <= expectedDbSizeMB;
    const memoryPassed = memoryUsageMB <= SLA.MEMORY_FOOTPRINT_MB;

    console.log('\n+------------------------+------------------+----------------+----------+');
    console.log('| Metric                 | Result           | SLA Target     | Status   |');
    console.log('+------------------------+------------------+----------------+----------+');

    const fmt = (val: number, unit: string) => `${val.toFixed(2)}${unit}`.padStart(12);
    const pass = (ok: boolean) => (ok ? 'PASS' : 'FAIL').padEnd(8);

    console.log(`| Cold Start             | ${fmt(coldStart.latencyMs, 'ms')}     | < ${SLA.COLD_START_MS}ms        | ${pass(coldStart.passed)} |`);
    console.log(`| Store Latency (avg)    | ${fmt(storeResult.avgTimeMs, 'ms')}     | < ${SLA.STORE_LATENCY_MS}ms         | ${pass(storeResult.slaPassed)} |`);
    console.log(`| Store Latency (P99)    | ${fmt(storeResult.p99Ms, 'ms')}     | < ${SLA.STORE_LATENCY_MS}ms         | ${pass(storeResult.p99Ms < SLA.STORE_LATENCY_MS)} |`);
    console.log(`| Search Latency (avg)   | ${fmt(searchResult.avgTimeMs, 'ms')}     | < ${SLA.SEARCH_LATENCY_MS}ms          | ${pass(searchResult.slaPassed)} |`);
    console.log(`| Search Latency (P99)   | ${fmt(searchResult.p99Ms, 'ms')}     | < ${SLA.SEARCH_LATENCY_MS}ms          | ${pass(searchResult.p99Ms < SLA.SEARCH_LATENCY_MS)} |`);
    console.log(`| Mixed Store (P99)      | ${fmt(mixedResult.storeResult.p99Ms, 'ms')}     | < ${SLA.STORE_LATENCY_MS}ms         | ${pass(mixedResult.storeResult.p99Ms < SLA.STORE_LATENCY_MS)} |`);
    console.log(`| Mixed Search (P99)     | ${fmt(mixedResult.searchResult.p99Ms, 'ms')}     | < ${SLA.SEARCH_LATENCY_MS}ms          | ${pass(mixedResult.searchResult.p99Ms < SLA.SEARCH_LATENCY_MS)} |`);
    console.log(`| Memory Usage           | ${fmt(memoryUsageMB, 'MB')}     | < ${SLA.MEMORY_FOOTPRINT_MB}MB        | ${pass(memoryPassed)} |`);
    console.log(`| Database Size          | ${fmt(dbSizeMB, 'MB')}     | < ${expectedDbSizeMB.toFixed(0)}MB          | ${pass(dbSizePassed)} |`);

    console.log('+------------------------+------------------+----------------+----------+');

    console.log(`\nThroughput: ${mixedResult.throughputOpsPerSec.toFixed(0)} ops/sec (mixed workload)`);

    const allPassed =
        coldStart.passed &&
        storeResult.slaPassed &&
        searchResult.slaPassed &&
        mixedResult.storeResult.slaPassed &&
        mixedResult.searchResult.slaPassed &&
        memoryPassed &&
        dbSizePassed;

    console.log('\n' + '='.repeat(70));
    if (allPassed) {
        console.log('ALL SLA TARGETS MET - BENCHMARK PASSED');
    } else {
        console.log('SOME SLA TARGETS NOT MET - SEE DETAILS ABOVE');
    }
    console.log('='.repeat(70));
}

// Main Execution
async function main(): Promise<void> {
    const config = parseArgs();

    printHeader('Memory Service Performance Benchmark');
    console.log('\nConfiguration:');
    console.log(`  Items to store:    ${config.numItems}`);
    console.log(`  Search operations: ${config.numSearches}`);
    console.log(`  Verbose mode:      ${config.verbose}`);

    const dbPath = path.join(os.tmpdir(), `memory-benchmark-${Date.now()}.db`);
    console.log(`\nBenchmark database: ${dbPath}`);

    try {
        // 1. Cold Start Benchmark
        printHeader('Cold Start Benchmark');
        console.log('  Testing database initialization...');
        const coldStart = await benchmarkColdStart(dbPath);
        console.log(`  Cold start latency: ${coldStart.latencyMs.toFixed(2)}ms`);
        console.log(`  SLA target: < ${SLA.COLD_START_MS}ms`);
        console.log(`  Status: ${coldStart.passed ? 'PASSED' : 'FAILED'}`);

        // 2. Store Benchmark
        printHeader('Store Benchmark');
        console.log(`  Generating ${config.numItems} test items...`);
        const testItems = generateTestData(config.numItems);
        console.log('  Storing items...');
        const storeResult = benchmarkStore(testItems, config.verbose);
        printResult(storeResult);

        // 3. Search Benchmark
        printHeader('Search Benchmark');
        console.log(`  Generating ${config.numSearches} search queries...`);
        const searchQueries = generateSearchQueries(config.numSearches);
        console.log('  Executing searches...');
        const searchResult = benchmarkSearch(searchQueries, config.verbose);
        printResult(searchResult);

        // 4. Mixed Workload Benchmark (real-world simulation)
        printHeader('Mixed Workload Benchmark (80% read, 20% write)');
        console.log('  Simulating interleaved reads/writes...');
        const mixedItems = generateTestData(Math.min(config.numItems, 500));
        const mixedQueries = generateSearchQueries(Math.min(config.numSearches, 200));
        const mixedResult = benchmarkMixedWorkload(mixedItems, mixedQueries, config.verbose);

        console.log('\nMixed Workload Results:');
        printSeparator();
        console.log(`  Total Operations:   ${mixedResult.totalOperations}`);
        console.log(`  Throughput:         ${mixedResult.throughputOpsPerSec.toFixed(0)} ops/sec`);
        console.log(`  Store avg/P99:      ${mixedResult.storeResult.avgTimeMs.toFixed(2)}ms / ${mixedResult.storeResult.p99Ms.toFixed(2)}ms`);
        console.log(`  Search avg/P99:     ${mixedResult.searchResult.avgTimeMs.toFixed(2)}ms / ${mixedResult.searchResult.p99Ms.toFixed(2)}ms`);

        // 5. Resource Usage
        const memoryUsageMB = getMemoryUsageMB();
        try {
            const db = getBenchmarkDatabase();
            db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
        } catch {
            // Ignore checkpoint errors
        }
        const dbSizeBytes = getDatabaseSizeBytes(dbPath);

        printHeader('Resource Usage');
        console.log(`  Memory (heap used): ${memoryUsageMB.toFixed(2)} MB (SLA: < ${SLA.MEMORY_FOOTPRINT_MB} MB)`);
        console.log(`  Database size:      ${formatBytes(dbSizeBytes)} (SLA: < ${SLA.DATABASE_SIZE_MB_PER_10K} MB per 10K items)`);

        // 6. Summary
        printSummary(config, coldStart, storeResult, searchResult, mixedResult, memoryUsageMB, dbSizeBytes);
    } finally {
        closeDatabase();
        cleanupDbFiles(dbPath);
        console.log('\nCleanup: Benchmark database removed');
    }
}

main().catch((error) => {
    console.error('Benchmark failed:', error);
    process.exit(1);
});
