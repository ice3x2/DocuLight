import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Field, Input } from '../src/components/ui/index.js';
import '../src/styles/index.css';

createRoot(document.getElementById('fixture-root')!).render(
  <StrictMode>
    <Field
      label="Document name"
      description="Use a name that distinguishes this document."
      error="Enter a document name."
    >
      <Input id="actual-field-input" defaultValue="Kept value" />
    </Field>
  </StrictMode>,
);
