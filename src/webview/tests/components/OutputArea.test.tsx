import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OutputArea } from '../../components/block/OutputArea';
import { FluxTermBlock, ResolvedShell } from '../../../types/MessageProtocol';

const mockShell: ResolvedShell = { id: 'sh', label: 'sh', path: '/bin/sh', args: [] };

const createMockBlock = (output: any[] = [], status: any = 'done'): FluxTermBlock => ({
    id: 'block-1',
    seq: 1,
    command: 'ls',
    shell: mockShell,
    cwd: '/home',
    branch: 'main',
    status,
    output,
    exitCode: null,
    finalCwd: null,
    finalBranch: null,
    createdAt: Date.now()
});

describe('OutputArea Component', () => {
    it('should show loading state when running and no output', () => {
        const block = createMockBlock([], 'running');
        render(<OutputArea block={block} searchQuery="" />);
        expect(screen.getByText('Waiting for output…')).toBeInTheDocument();
    });

    it('should show "no output" when done and empty', () => {
        const block = createMockBlock([], 'done');
        render(<OutputArea block={block} searchQuery="" />);
        expect(screen.getByText('(no output)')).toBeInTheDocument();
    });

    it('should render stdout and stderr lines', () => {
        const block = createMockBlock([
            { text: 'hello world', type: 'stdout' },
            { text: 'error occurred', type: 'stderr' }
        ]);
        render(<OutputArea block={block} searchQuery="" />);
        expect(screen.getByText('hello world')).toBeInTheDocument();
        expect(screen.getByText('error occurred')).toBeInTheDocument();
    });

    it('should merge stdin lines onto preceding lines', () => {
        const block = createMockBlock([
            { text: 'Name:', type: 'stdout' },
            { text: 'John', type: 'stdin' }
        ]);
        render(<OutputArea block={block} searchQuery="" />);
        
        // buildDisplayRows merges stdin onto stdout
        expect(screen.getByText('Name:')).toBeInTheDocument();
        expect(screen.getByText('John')).toBeInTheDocument();
    });

    it('should highlight search results', () => {
        const block = createMockBlock([
            { text: 'find me', type: 'stdout' },
            { text: 'not here', type: 'stdout' }
        ]);
        render(<OutputArea block={block} searchQuery="find" />);
        
        const row = screen.getByText('find me').closest('div');
        expect(row).not.toBeNull();
        // Check computed style or inline style
        expect(row?.style.backgroundColor).toBeTruthy();
    });
});
