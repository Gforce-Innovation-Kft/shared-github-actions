/** Pull ApexClass/ApexTrigger member names out of a package.xml manifest. */
import type { ApexMemberSelection } from '../models/types';

const APEX_TYPES = new Set(['ApexClass', 'ApexTrigger']);

export function parseApexMembers(manifestXml: string): ApexMemberSelection {
  const names: string[] = [];
  let hasWildcard = false;
  for (const block of manifestXml.match(/<types>[\s\S]*?<\/types>/g) ?? []) {
    const typeName = block.match(/<name>\s*([^<\s]+)\s*<\/name>/)?.[1] ?? '';
    if (!APEX_TYPES.has(typeName)) {
      continue;
    }
    for (const memberTag of block.match(/<members>\s*[^<]+?\s*<\/members>/g) ?? []) {
      const value = memberTag.replace(/<\/?members>/g, '').trim();
      if (value === '*') {
        hasWildcard = true;
      } else {
        names.push(value);
      }
    }
  }
  return { names, hasWildcard };
}
