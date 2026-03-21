import { promises as fs } from 'fs';
import { basename, resolve } from 'path';
import { Client } from 'pg';

const toSlug = (filename: string) => {
  const name = filename.replace(/\.md$/i, '');
  return `velog-series-${name.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
};

const readTitle = (markdown: string, fallback: string): string => {
  const lines = markdown.split(/\r?\n/);
  const headingLine = lines.find((line) => /^#\s+/.test(line.trim()));
  if (!headingLine) {
    return fallback;
  }
  return headingLine.replace(/^#\s+/, '').trim();
};

const extractSummary = (markdown: string): string => {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        Boolean(line) &&
        !line.startsWith('#') &&
        !line.startsWith('![') &&
        !line.startsWith('```'),
    );

  const source = lines[0] ?? 'Mirim OAuth 시리즈 인터랙티브 글';
  return source.replace(/\s+/g, ' ').slice(0, 150);
};

const enhanceInteractiveMarkdown = (
  markdown: string,
  title: string,
  order: number,
  total: number,
): string => {
  const section = [
    '',
    '---',
    '',
    '## 인터랙티브 체크포인트',
    '',
    `- 진행도: **${order}/${total}**`,
    '- 아래 코드를 실행해서 오늘 학습을 점검하세요.',
    '',
    '```jsx',
    `function EpisodeCheckpoint${order}() {`,
    '  const [done, setDone] = useState(false);',
    '  const [score, setScore] = useState(3);',
    '',
    '  return (',
    '    <div className="space-y-3 p-4 border rounded-lg">',
    `      <h4 className="font-medium">${title} 체크</h4>`,
    '      <label className="flex items-center gap-2 text-sm">',
    '        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />',
    '        핵심 흐름을 내 코드로 재현했다',
    '      </label>',
    '      <div className="space-y-1">',
    '        <p className="text-sm">이해도: {score}/5</p>',
    '        <input type="range" min={1} max={5} value={score} onChange={(e) => setScore(Number(e.target.value))} className="w-full" />',
    '      </div>',
    "      <p className=\"text-sm text-muted-foreground\">{done ? '완료! 다음 편으로 이동하세요.' : '완료 체크 후 다음 편으로 이동하세요.'}</p>",
    '    </div>',
    '  );',
    '}',
    '```',
    '',
    '### 적용 질문',
    '- 이 편 내용을 내 프로젝트에 적용한다면 무엇을 먼저 바꾸겠나요?',
    '',
  ].join('\n');

  return `${markdown.trim()}\n${section}`;
};

async function run() {
  const seriesDir = resolve(process.cwd(), '..', 'velog-series');
  const allFiles = await fs.readdir(seriesDir);
  const targetFiles = allFiles
    .filter((name) => /^\d{2}-.+\.md$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  if (targetFiles.length === 0) {
    throw new Error('velog-series에 시드할 마크다운 파일이 없습니다.');
  }

  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'blog',
  });
  await client.connect();

  const upserted: string[] = [];

  for (let index = 0; index < targetFiles.length; index += 1) {
    const filename = targetFiles[index];
    const order = index + 1;
    const filePath = resolve(seriesDir, filename);
    const markdown = await fs.readFile(filePath, 'utf-8');

    const fallbackTitle = basename(filename, '.md')
      .replace(/^\d{2}-/, '')
      .replace(/-/g, ' ');
    const title = readTitle(markdown, fallbackTitle);
    const slug = toSlug(filename);
    const summary = extractSummary(markdown);
    const contentMarkdown = enhanceInteractiveMarkdown(
      markdown,
      title,
      order,
      targetFiles.length,
    );

    await client.query(
      `
      INSERT INTO posts (slug, title, summary, "contentMarkdown", "isPublished")
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (slug)
      DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        "contentMarkdown" = EXCLUDED."contentMarkdown",
        "isPublished" = true,
        "updatedAt" = NOW()
      `,
      [slug, title, summary, contentMarkdown],
    );

    upserted.push(slug);
  }

  console.log(`[seed] upserted ${upserted.length} velog-series posts`);
  upserted.forEach((value) => console.log(` - ${value}`));
  await client.end();
}

run().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
