import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useNotebook } from '../../store/notebookStore';
import { FluxTermContext, ResolvedShell } from '../../../types/MessageProtocol';

const mockContext: FluxTermContext = {
    cwd: '/test/cwd',
    branch: 'main',
    shell: null,
    connection: 'local'
};

const mockShell: ResolvedShell = {
    id: 'test-bash',
    label: 'Bash',
    path: '/bin/bash',
    args: ['-l']
};

describe('useNotebook Store Hook', () => {
    it('should initialize with provided context and empty blocks', () => {
        const { result } = renderHook(() => useNotebook(mockContext, []));
        expect(result.current.runtimeContext).toEqual(mockContext);
        expect(result.current.blocks).toEqual([]);
    });

    it('should create a new block and increment seq', () => {
        const { result } = renderHook(() => useNotebook(mockContext, []));
        
        let blockId: string = '';
        act(() => {
            blockId = result.current.createBlock('echo hi', mockShell, '/test/cwd', 'main');
        });

        expect(result.current.blocks).toHaveLength(1);
        expect(result.current.blocks[0].id).toBe(blockId);
        expect(result.current.blocks[0].seq).toBe(1);
        expect(result.current.blocks[0].command).toBe('echo hi');
        expect(result.current.blocks[0].status).toBe('running');
    });

    it('should append output lines to a block', () => {
        const { result } = renderHook(() => useNotebook(mockContext, []));
        
        let blockId: string = '';
        act(() => {
            blockId = result.current.createBlock('ls', mockShell, '/test/cwd', 'main');
        });

        act(() => {
            result.current.appendOutput(blockId, [
                { text: 'file1.txt', type: 'stdout' },
                { text: 'file2.txt', type: 'stdout' }
            ]);
        });

        expect(result.current.blocks[0].output).toHaveLength(2);
        expect(result.current.blocks[0].output[0].text).toBe('file1.txt');
    });

    it('should complete a block and update runtime context', () => {
        const { result } = renderHook(() => useNotebook(mockContext, []));
        
        let blockId: string = '';
        act(() => {
            blockId = result.current.createBlock('cd /new/path', mockShell, '/test/cwd', 'main');
        });

        act(() => {
            result.current.completeBlock(blockId, 0, '/new/path', 'feature-branch', 'done');
        });

        expect(result.current.blocks[0].status).toBe('done');
        expect(result.current.blocks[0].exitCode).toBe(0);
        expect(result.current.runtimeContext.cwd).toBe('/new/path');
        expect(result.current.runtimeContext.branch).toBe('feature-branch');
    });

    it('should respect sequence guard when updating context', () => {
        const { result } = renderHook(() => useNotebook(mockContext, []));
        
        let id1: string = '';
        let id2: string = '';
        act(() => {
            id1 = result.current.createBlock('cmd1', mockShell, '/path1', 'main'); // seq 1
            id2 = result.current.createBlock('cmd2', mockShell, '/path2', 'main'); // seq 2
        });

        // Complete seq 2 first
        act(() => {
            result.current.completeBlock(id2, 0, '/path2', 'main', 'done');
        });
        expect(result.current.runtimeContext.cwd).toBe('/path2');

        // Complete seq 1 later - should NOT overwrite path2
        act(() => {
            result.current.completeBlock(id1, 0, '/path1-stale', 'main', 'done');
        });
        expect(result.current.runtimeContext.cwd).toBe('/path2');
    });

    it('should clone a block for re-run', () => {
        const { result } = renderHook(() => useNotebook(mockContext, []));
        
        let id1: string = '';
        act(() => {
            id1 = result.current.createBlock('ls -la', mockShell, '/test/cwd', 'main');
        });

        let id2: string | null = null;
        act(() => {
            id2 = result.current.reRunBlock(id1);
        });

        expect(result.current.blocks).toHaveLength(2);
        expect(id2).not.toBeNull();
        expect(result.current.blocks[1].command).toBe('ls -la');
        expect(result.current.blocks[1].seq).toBe(2);
    });
});
