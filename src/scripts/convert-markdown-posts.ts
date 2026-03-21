import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { basename, extname, resolve } from 'path';

type BlockType =
  | 'heading'
  | 'paragraph'
  | 'code'
  | 'image'
  | 'divider'
  | 'quote'
  | 'interactive';

type ContentBlock = {
  id: string;
  type: BlockType;
  content: string;
  metadata?: {
    level?: 1 | 2 | 3;
    language?: string;
    url?: string;
    alt?: string;
    editable?: boolean | 'restricted';
    editableLines?: number[];
    scope?: string;
  };
};

type Frontmatter = {
  title?: string;
  slug?: string;
  tags?: string[];
  thumbnail?: string;
  readingTime?: number;
};

type ParsedMarkdown = {
  frontmatter: Frontmatter;
  body: string;
};

const isMarkdown = (filename: string): boolean => {
  const ext = extname(filename).toLowerCase();
  return ext === '.md' || ext === '.markdown';
};

const toSlug = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const estimateReadingTime = (markdown: string): number => {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_~\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) {
    return 1;
  }

  const words = plain.split(' ').length;
  return Math.max(1, Math.ceil(words / 220));
};

const parseTags = (raw: string): string[] => {
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  return trimmed
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
};

const parseFrontmatter = (markdown: string): ParsedMarkdown => {
  if (!markdown.startsWith('---\n') && !markdown.startsWith('---\r\n')) {
    return { frontmatter: {}, body: markdown };
  }

  const normalized = markdown.replace(/\r\n/g, '\n');
  const endIndex = normalized.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const rawFrontmatter = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5);
  const frontmatter: Frontmatter = {};

  rawFrontmatter.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key === 'title') {
      frontmatter.title = value.replace(/^['"]|['"]$/g, '');
      return;
    }

    if (key === 'slug') {
      frontmatter.slug = value.replace(/^['"]|['"]$/g, '');
      return;
    }

    if (key === 'thumbnail') {
      frontmatter.thumbnail = value.replace(/^['"]|['"]$/g, '');
      return;
    }

    if (key === 'tags') {
      frontmatter.tags = parseTags(value);
      return;
    }

    if (key === 'readingTime') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && parsed > 0) {
        frontmatter.readingTime = Math.floor(parsed);
      }
    }
  });

  return { frontmatter, body };
};

const parseFenceMetadata = (
  info: string,
): {
  type: 'code' | 'interactive';
  language: string;
  editable?: boolean | 'restricted';
  editableLines?: number[];
} => {
  const parts = info.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? 'text';

  let type: 'code' | 'interactive' =
    first === 'interactive' ? 'interactive' : 'code';
  let language = 'text';
  let editable: boolean | 'restricted' | undefined;
  let editableLines: number[] | undefined;

  if (type === 'interactive') {
    language = parts[1] ?? 'jsx';
  } else {
    language = first;
  }

  parts.forEach((token) => {
    if (!token.includes('=')) {
      return;
    }

    const [rawKey, rawValue] = token.split('=');
    const key = rawKey.trim();
    const value = rawValue.trim();

    if (key === 'type' && value === 'interactive') {
      type = 'interactive';
    }

    if (key === 'editable') {
      if (value === 'true') {
        editable = true;
      } else if (value === 'false') {
        editable = false;
      } else if (value === 'restricted') {
        editable = 'restricted';
      }
    }

    if (key === 'lines') {
      editableLines = value
        .split(',')
        .map((entry) => Number(entry.trim()))
        .filter((line) => Number.isInteger(line) && line > 0)
        .map((line) => line - 1);
    }
  });

  return { type, language, editable, editableLines };
};

const buildBlocks = (markdown: string): ContentBlock[] => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ContentBlock[] = [];
  let index = 0;

  const pushParagraph = (paragraphLines: string[]) => {
    const content = paragraphLines.join('\n').trim();
    if (!content) {
      return;
    }

    blocks.push({
      id: randomUUID(),
      type: 'paragraph',
      content,
    });
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'heading',
        content: headingMatch[2].trim(),
        metadata: { level: headingMatch[1].length as 1 | 2 | 3 },
      });
      index += 1;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      blocks.push({
        id: randomUUID(),
        type: 'divider',
        content: '',
      });
      index += 1;
      continue;
    }

    const imageMatch = /^!\[(.*?)\]\((.*?)\)$/.exec(trimmed);
    if (imageMatch) {
      blocks.push({
        id: randomUUID(),
        type: 'image',
        content: imageMatch[1].trim(),
        metadata: {
          alt: imageMatch[1].trim(),
          url: imageMatch[2].trim(),
        },
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index].trim();
        if (!quoteLine.startsWith('>')) {
          break;
        }
        quoteLines.push(quoteLine.replace(/^>\s?/, ''));
        index += 1;
      }

      blocks.push({
        id: randomUUID(),
        type: 'quote',
        content: quoteLines.join('\n').trim(),
      });
      continue;
    }

    const fenceMatch = /^```(.*)$/.exec(trimmed);
    if (fenceMatch) {
      const info = fenceMatch[1].trim();
      const fence = parseFenceMetadata(info);
      index += 1;

      const codeLines: string[] = [];
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      if (fence.type === 'interactive') {
        blocks.push({
          id: randomUUID(),
          type: 'interactive',
          content: codeLines.join('\n').trimEnd(),
          metadata: {
            language: fence.language,
            editable: fence.editable ?? true,
            editableLines: fence.editableLines,
          },
        });
      } else {
        blocks.push({
          id: randomUUID(),
          type: 'code',
          content: codeLines.join('\n').trimEnd(),
          metadata: { language: fence.language || 'text' },
        });
      }

      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const next = lines[index];
      const nextTrimmed = next.trim();

      if (
        !nextTrimmed ||
        /^(#{1,3})\s+/.test(nextTrimmed) ||
        nextTrimmed === '---' ||
        nextTrimmed === '***' ||
        /^```/.test(nextTrimmed) ||
        /^>/.test(nextTrimmed) ||
        /^!\[(.*?)\]\((.*?)\)$/.test(nextTrimmed)
      ) {
        break;
      }

      paragraphLines.push(next);
      index += 1;
    }

    pushParagraph(paragraphLines);
  }

  return blocks;
};

const readMarkdownFiles = async (inputPath: string): Promise<string[]> => {
  const absolute = resolve(process.cwd(), inputPath);
  const stat = await fs.stat(absolute);

  if (stat.isFile()) {
    return isMarkdown(absolute) ? [absolute] : [];
  }

  const files = await fs.readdir(absolute);
  return files
    .filter((filename) => isMarkdown(filename))
    .sort((a, b) => a.localeCompare(b))
    .map((filename) => resolve(absolute, filename));
};

const readTitleFromMarkdown = (body: string, fallback: string): string => {
  const firstHeading = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .find((line) => /^#\s+/.test(line.trim()));

  if (!firstHeading) {
    return fallback;
  }

  return firstHeading.replace(/^#\s+/, '').trim();
};

const getArgValue = (name: string): string | undefined => {
  const matched = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (!matched) {
    return undefined;
  }
  return matched.slice(name.length + 1);
};

async function run() {
  const rawInput = process.argv[2] ?? '../velog-series';
  const outputDir = getArgValue('--out') ?? './tmp/converted-posts';
  const defaultTag = getArgValue('--default-tag') ?? 'imported';

  const files = await readMarkdownFiles(rawInput);
  if (!files.length) {
    throw new Error('변환할 마크다운 파일이 없습니다.');
  }

  const absoluteOutputDir = resolve(process.cwd(), outputDir);
  await fs.mkdir(absoluteOutputDir, { recursive: true });

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const fallbackTitle = basename(file, extname(file)).replace(/[-_]/g, ' ');
    const title =
      frontmatter.title ?? readTitleFromMarkdown(body, fallbackTitle);
    const slug = frontmatter.slug ?? toSlug(basename(file, extname(file)));
    const tags = frontmatter.tags?.length ? frontmatter.tags : [defaultTag];
    const blocks = buildBlocks(body);
    const readingTime = frontmatter.readingTime ?? estimateReadingTime(body);

    const payload = {
      slug,
      title,
      thumbnail: frontmatter.thumbnail ?? null,
      tags,
      content: blocks,
      readingTime,
    };

    const outPath = resolve(absoluteOutputDir, `${slug}.json`);
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf-8');

    console.log(`[markdown-convert] converted: ${slug} (${basename(file)})`);
  }

  console.log(`[markdown-convert] output directory: ${absoluteOutputDir}`);
}

run().catch((error) => {
  console.error('[markdown-convert] failed:', error);
  process.exit(1);
});
