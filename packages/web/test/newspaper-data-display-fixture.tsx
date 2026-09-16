import { createRoot } from 'react-dom/client';

import {
  Badge,
  EmptyState,
  InlineNotice,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../src/components/ui/index.js';
import '../src/styles/index.css';

const fullPath = 'C:/문서보관함/아주-긴-한글-워크스페이스/회의자료/2026년-운영계획-최종본.md';

createRoot(document.getElementById('fixture-root')!).render(
  <main data-slot="document" style={{ padding: 24, width: 520 }}>
    <Table aria-label="Documents">
      <TableHeader>
        <TableRow><TableHead>Path</TableHead><TableHead numeric>Bytes</TableHead><TableHead>Status</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow selected>
          <TableCell><a id="full-path" href="#path">{fullPath}</a></TableCell>
          <TableCell numeric>2048</TableCell>
          <TableCell><Badge variant="success">Active</Badge></TableCell>
        </TableRow>
        <TableRow>
          <TableCell>짧은 경로.md</TableCell>
          <TableCell numeric>32</TableCell>
          <TableCell><Badge variant="warning">Pending</Badge></TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <LoadingState label="Loading documents" />
    <EmptyState title="No documents" description="Create a document to begin." />
    <InlineNotice variant="error" title="Could not load">Try again.</InlineNotice>
  </main>,
);
