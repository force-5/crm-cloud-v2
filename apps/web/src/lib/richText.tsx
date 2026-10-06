import { Fragment, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

/**
 * Translate a string and splice React nodes into its `{{placeholders}}` — e.g. a bold account
 * name. Values are inserted as React children (never parsed as markup), so user data such as
 * `<script>` in a name always renders as text.
 */
export function richT(t: TFunction, key: string, nodes: Record<string, ReactNode>): ReactNode {
  const markers = Object.fromEntries(Object.keys(nodes).map((k) => [k, `⁣${k}⁣`]));
  const text = String(t(key, markers));
  const parts = text.split('⁣');
  return parts.map((part, i) => (i % 2 === 1 && part in nodes ? <Fragment key={i}>{nodes[part]}</Fragment> : <Fragment key={i}>{part}</Fragment>));
}
