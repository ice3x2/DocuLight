import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../src/components/ui/index.js';
import { ConfirmGate } from '../src/confirm/ConfirmGate.js';
import '../src/styles/index.css';

function Fixture() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmTrigger = useRef<HTMLButtonElement>(null);

  return (
    <main data-slot="document" style={{ minHeight: '100vh', padding: 24 }}>
      <Popover open>
        <PopoverTrigger asChild><Button id="underlying-popover-trigger" variant="secondary">Page help</Button></PopoverTrigger>
        <PopoverContent id="underlying-popover-content">
          <Button id="underlying-popover-action">Underlying action</Button>
        </PopoverContent>
      </Popover>

      <Dialog>
        <DialogTrigger asChild><Button id="dialog-trigger">Open dialog</Button></DialogTrigger>
        <DialogContent>
          <DialogTitle>Edit a long Korean document name</DialogTitle>
          <DialogDescription>긴 한글 설명은 폭을 넘지 않고 자연스럽게 여러 줄로 이어져야 합니다.</DialogDescription>
          <Popover>
            <PopoverTrigger asChild><Button id="dialog-owned-popover-trigger" variant="secondary">Dialog help</Button></PopoverTrigger>
            <PopoverContent id="dialog-owned-popover-content"><Button id="dialog-owned-action">Dialog action</Button></PopoverContent>
          </Popover>
          <Button>Save</Button>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button id="menu-trigger" variant="secondary">Open menu</Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          {Array.from({ length: 30 }, (_, index) => <DropdownMenuItem key={index}>Item {index + 1}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog>
        <DialogTrigger asChild><Button id="confirm-dialog-trigger">Open danger settings</Button></DialogTrigger>
        <DialogContent id="confirm-dialog-content">
          <DialogTitle>Danger settings</DialogTitle>
          <DialogDescription>Review a destructive workspace operation.</DialogDescription>
          <Button ref={confirmTrigger} id="confirm-trigger" variant="destructive" onClick={() => setConfirmOpen(true)}>
            Open danger
          </Button>
          <ConfirmGate
            open={confirmOpen}
            grade="L3"
            title="Delete workspace"
            description="Type the exact token after reviewing the impact."
            token="DELETE"
            restoreFocusRef={confirmTrigger}
            onConfirm={() => undefined}
            onCancel={() => setConfirmOpen(false)}
          >
            <Popover>
              <PopoverTrigger asChild><Button id="nested-popover-trigger" variant="secondary">Review impact</Button></PopoverTrigger>
              <PopoverContent id="alert-owned-popover-content"><Button id="popover-last-action">Last impact action</Button></PopoverContent>
            </Popover>
          </ConfirmGate>
        </DialogContent>
      </Dialog>
    </main>
  );
}

createRoot(document.getElementById('fixture-root')!).render(<Fixture />);
