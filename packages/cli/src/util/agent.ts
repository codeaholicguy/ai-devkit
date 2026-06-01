import path from 'path';

export function generateAgentName(cwd: string): string {
    const folder = path.basename(cwd)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'agent';
    return `${folder}-${Date.now().toString(36)}`;
}
