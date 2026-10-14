import { describe, expect, it } from 'vitest';

import { contentPageSchema } from '../src/content';

const page = {
  status: 'placeholder',
  title: 'Travel info',
  sections: [
    {
      id: 'money',
      title: 'Money & cash',
      note: 'Last verified 28 Sep 2026',
      blocks: [
        { type: 'paragraph', text: 'Bring cash.' },
        { type: 'table', head: ['Cover', 'Minimum'], rows: [['Medical', 'Required']] },
        { type: 'steps', items: [{ title: 'Apply', when: 'Today', text: 'Online.' }] },
      ],
    },
  ],
};

describe('contentPageSchema', () => {
  it('accepts a page of typed blocks', () => {
    expect(contentPageSchema.parse(page).sections[0]!.blocks).toHaveLength(3);
  });

  it('rejects an unknown block type and an anchor that is not a slug', () => {
    expect(() =>
      contentPageSchema.parse({
        ...page,
        sections: [{ id: 'x', title: 'X', blocks: [{ type: 'html', text: '<b>' }] }],
      }),
    ).toThrow();
    expect(() =>
      contentPageSchema.parse({
        ...page,
        sections: [{ ...page.sections[0], id: 'Money!' }],
      }),
    ).toThrow();
  });

  it('only knows the placeholder and published states', () => {
    expect(() => contentPageSchema.parse({ ...page, status: 'draft' })).toThrow();
  });
});
