import type { ContentBlock } from '@ota/schemas';
import {
  cn,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { getTranslations } from 'next-intl/server';

function BlockTitle({ children }: { children: string }) {
  return <h3 className="text-h4 text-default">{children}</h3>;
}

/** Renders a tenant content section's blocks (`@ota/schemas` content) with the DS type and tables. */
export async function ContentBlocks({ blocks }: { blocks: readonly ContentBlock[] }) {
  const t = await getTranslations('pages.common');

  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={index} className="max-w-prose text-body text-default">
                {block.text}
              </p>
            );
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <div key={index} className="flex flex-col gap-2">
                {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
                <List
                  className={`flex max-w-prose flex-col gap-1.5 pl-5 text-body ${block.ordered ? 'list-decimal' : 'list-disc'}`}
                >
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </List>
              </div>
            );
          }
          case 'definitions':
            return (
              <div key={index} className="flex flex-col gap-3">
                {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
                <dl className="grid gap-4 md:grid-cols-2">
                  {block.items.map((item) => (
                    <div key={item.term} className="flex flex-col gap-1">
                      <dt className="text-body font-semibold text-default">
                        {item.term}
                      </dt>
                      <dd className="text-body-sm text-secondary">{item.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          case 'steps':
            return (
              <ol key={index} className="flex flex-col gap-4">
                {block.items.map((step, position) => (
                  <li key={step.title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-label text-primary-700"
                    >
                      {position + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      {step.when ? (
                        <span className="text-overline uppercase text-secondary-600">
                          {step.when}
                        </span>
                      ) : null}
                      <span className="text-body font-semibold text-default">
                        {step.title}
                      </span>
                      <span className="max-w-prose text-body-sm text-secondary">
                        {step.text}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            );
          case 'table':
            return (
              <div key={index} className="overflow-hidden rounded-lg border bg-surface">
                <Table>
                  {block.caption ? (
                    <caption className="caption-top px-3 py-2.5 text-left text-body font-semibold text-default">
                      {block.caption}
                    </caption>
                  ) : null}
                  <TableHeader>
                    <TableRow>
                      {block.head.map((cell) => (
                        <TableHead key={cell}>{cell}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {block.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex}>{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          case 'quote':
            return (
              <figure
                key={index}
                className="max-w-prose border-l-4 border-accent-500 pl-4"
              >
                <blockquote className="font-display text-h4 text-default">
                  {block.text}
                </blockquote>
                {block.cite ? (
                  <figcaption className="mt-2 text-body-sm text-muted">
                    {block.cite}
                  </figcaption>
                ) : null}
              </figure>
            );
          case 'callout':
            return (
              <div
                key={index}
                className="flex max-w-prose flex-col gap-1 rounded-lg bg-sunken p-4"
              >
                {block.title ? (
                  <p className="text-body font-semibold text-default">{block.title}</p>
                ) : null}
                <p className="text-body-sm text-secondary">{block.text}</p>
              </div>
            );
          case 'photo':
            return (
              <PhotoSlot
                key={index}
                alt={block.alt}
                caption={block.caption}
                label={t('photoToCome')}
              />
            );
        }
      })}
    </div>
  );
}

/**
 * An image slot while photography is still to come (T-Signoff §03): a sunken
 * frame that carries the intended alt text, so the layout and the accessible
 * name are right before the photo exists.
 */
export function PhotoSlot({
  alt,
  caption,
  label,
  className,
}: {
  alt: string;
  caption?: string;
  label: string;
  /** Width cap; in running text a photo keeps to the reading measure. */
  className?: string;
}) {
  return (
    <figure className={cn('flex w-full max-w-prose flex-col gap-2', className)}>
      <div
        role="img"
        aria-label={alt}
        className="flex aspect-[3/2] w-full items-center justify-center gap-2 rounded-lg bg-sunken text-body-sm text-muted"
      >
        <Icon name="sun" />
        <span aria-hidden="true">{label}</span>
      </div>
      {caption ? (
        <figcaption className="text-caption text-muted">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
