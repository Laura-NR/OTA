import { describe, expect, it } from 'vitest';

import {
  conditionsContentSchema,
  contentPageSchema,
  destinationsContentSchema,
  eventBannerContentSchema,
  homeContentSchema,
} from '../src/content';

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

const home = {
  status: 'placeholder',
  hero: {
    title: 'Travel Cuba with respect.',
    lede: 'Stay in casas.',
    promises: ['Total price shown'],
    photo: { alt: 'A casa porch' },
  },
  steps: {
    title: 'How booking works',
    items: [{ title: 'Request', text: 'We confirm.' }],
  },
  featured: { title: 'Featured trips' },
  why: {
    title: 'Why us',
    stats: [{ value: '85 %', text: 'reaches families', tone: 'secondary' }],
    points: ['Named hosts'],
  },
  custom: { title: 'Custom', text: 'Six questions.', cta: 'Start' },
  guides: { title: 'Guides' },
};

describe('homeContentSchema', () => {
  it('accepts the agency copy around the live trips', () => {
    expect(homeContentSchema.parse(home).hero.promises).toEqual(['Total price shown']);
  });

  it('keeps the promises to three and the stat tiles to the four drawn tones', () => {
    expect(() =>
      homeContentSchema.parse({
        ...home,
        hero: { ...home.hero, promises: ['a', 'b', 'c', 'd'] },
      }),
    ).toThrow();
    expect(() =>
      homeContentSchema.parse({
        ...home,
        why: { ...home.why, stats: [{ value: '1', text: 'x', tone: 'red' }] },
      }),
    ).toThrow();
  });
});

describe('conditions and event strips', () => {
  const conditions = {
    status: 'placeholder',
    strip: { headline: 'Cuba right now.', text: 'Power cuts.' },
    title: 'The briefing',
    updated: 'Updated 3 Oct',
    items: [{ topic: 'power', label: 'Power', value: '6–12 h cuts', tone: 'caution' }],
  };

  it('accepts a briefing whose rows name a known topic and tone', () => {
    expect(conditionsContentSchema.parse(conditions).items[0]!.topic).toBe('power');
    expect(() =>
      conditionsContentSchema.parse({
        ...conditions,
        items: [{ ...conditions.items[0], topic: 'politics' }],
      }),
    ).toThrow();
    expect(() => conditionsContentSchema.parse({ ...conditions, items: [] })).toThrow();
  });

  it('requires the event call to action', () => {
    const event = {
      status: 'placeholder',
      label: 'Event',
      headline: 'Jazz',
      text: 'Concerts.',
    };
    expect(() => eventBannerContentSchema.parse(event)).toThrow();
    expect(eventBannerContentSchema.parse({ ...event, cta: 'Ask' }).cta).toBe('Ask');
  });
});

describe('destinationsContentSchema', () => {
  const destinations = {
    status: 'placeholder',
    title: 'Where our hosts are',
    themes: { culture: 'Culture & music' },
    items: {
      havana: {
        name: 'Havana',
        tagline: 'Rumba and the Malecón.',
        alt: 'Malecón at dusk',
        power: 'Battery casas',
        stays: '14 casas',
      },
    },
  };

  it('holds only words, keyed by destination slug, with optional detail pages', () => {
    const parsed = destinationsContentSchema.parse(destinations);
    expect(parsed.details).toEqual({});
    expect(parsed.provinces).toEqual({});
  });

  it('checks a detail page section by section', () => {
    const withDetail = (detail: unknown) =>
      destinationsContentSchema.parse({ ...destinations, details: { havana: detail } });
    expect(
      withDetail({ overview: { title: 'What it is', paragraphs: ['A city.'] } }).details
        .havana!.overview!.tags,
    ).toEqual([]);
    expect(() =>
      withDetail({
        conditions: {
          title: 'This month',
          items: [{ topic: 'politics', label: 'X', text: 'Y', status: 'Z', tone: 'ok' }],
        },
      }),
    ).toThrow();
    expect(() =>
      withDetail({
        gettingThere: { title: 'Getting there', head: ['Leg'], rows: [['A']] },
      }),
    ).toThrow();
  });
});
