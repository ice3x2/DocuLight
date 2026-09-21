import { describe, expect, it } from 'vitest';

import { relocationFocusFallback, relocationTransportFor, type WorkspaceTreeView } from '../src/tree/tree-contract.js';

const node = (id: string, children: WorkspaceTreeView['roots'] = [], kind: 'file' | 'directory' = children.length === 0 ? 'file' : 'directory'): WorkspaceTreeView['roots'][number] => ({
  id, name: id, kind, visibility: 'full', level: 'edit', parentLevel: 'edit', children,
});
const workspaces: WorkspaceTreeView[] = [
  { workspace: { id: 'workspace-1', name: 'One' }, visibility: 'full', roots: [node('source', [node('directory-1', [], 'directory'), node('file-1')])] },
  { workspace: { id: 'workspace-2', name: 'Two' }, visibility: 'full', roots: [] },
];

describe('IR-SHELL-011 relocation destination transport', () => {
  it('represents same-workspace root move as omitted preview destination and null parent', () => {
    expect(relocationTransportFor(workspaces, 'source', 'move', 'workspace-1')).toEqual({ previewDestinationId: null, writeDestination: null });
  });

  it('refuses cross-workspace root move and missing lookups', () => {
    expect(relocationTransportFor(workspaces, 'source', 'move', 'workspace-2')).toBeNull();
    expect(relocationTransportFor(workspaces, 'missing', 'move', 'workspace-1')).toBeNull();
    expect(relocationTransportFor(workspaces, 'source', 'copy', 'missing')).toBeNull();
  });

  // @req IR-SHELL-011 AC-9
  it('refuses a file as a relocation destination', () => {
    expect(relocationTransportFor(workspaces, 'directory-1', 'move', 'file-1')).toBeNull();
    expect(relocationTransportFor(workspaces, 'directory-1', 'copy', 'file-1')).toBeNull();
  });

  it('keeps copy roots and directory destinations explicit', () => {
    expect(relocationTransportFor(workspaces, 'source', 'copy', 'workspace-2')).toEqual({ previewDestinationId: 'workspace-2', writeDestination: { workspaceId: 'workspace-2' } });
    expect(relocationTransportFor(workspaces, 'source', 'move', 'directory-1')).toEqual({ previewDestinationId: 'directory-1', writeDestination: 'directory-1' });
    expect(relocationTransportFor(workspaces, 'source', 'copy', 'directory-1')).toEqual({ previewDestinationId: 'directory-1', writeDestination: { parentId: 'directory-1' } });
  });

  it('captures next, previous, parent, and workspace focus fallbacks by stable id', () => {
    const tree: WorkspaceTreeView[] = [{
      workspace: { id: 'workspace-1', name: 'One' }, visibility: 'full',
      roots: [node('parent', [node('previous'), node('source'), node('next')])],
    }];
    expect(relocationFocusFallback(tree, 'source')).toEqual(['next', 'previous', 'parent', 'workspace-1']);
  });
});
