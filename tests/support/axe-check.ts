import axe from 'axe-core';

import { settled } from '@tests/support/ui/animations';

/**
 * Runs axe over the page once its transitions have ended, since colours in a fading dialog are
 * half-way, and describes every violation, whatever its impact, one line each with the elements
 * it found; an empty list is a pass.
 */
export async function axeViolations(root: Element = document.body): Promise<string[]> {
  await settled();
  const { violations } = await axe.run(root, { resultTypes: ['violations'] });
  return violations.map(
    (violation) =>
      `${violation.impact} ${violation.id}: ${violation.nodes
        .map((node) => `${node.target.join(' ')} ${node.html.slice(0, 160)}`)
        .join(' | ')}`
  );
}
