import { unzipSync } from 'fflate';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';

/**
 * Skill import: turns an uploaded `.md` file or `.zip` archive into a preview
 * of the skill's Markdown core. Pure — nothing touches the filesystem, runs,
 * or persists. A third-party skill is third-party instructions in an agent's
 * prompt, so the only thing we ever keep is Markdown text the user reviews
 * before saving; scripts and every other archive entry are listed and dropped.
 */

export const IMPORT_LIMITS = {
  /** Raw upload size (the .md or the .zip). */
  uploadBytes: 1_048_576,
  /** Sum of declared uncompressed sizes across archive entries (zip-bomb guard). */
  unpackedBytes: 5 * 1_048_576,
  entries: 200,
  /** Same ceiling as a skill body accepted by POST /skills. */
  bodyChars: 100_000,
} as const;

const EXECUTABLE = /\.(sh|bash|zsh|fish|py|js|mjs|cjs|ts|rb|pl|php|ps1|bat|cmd|exe|bin|jar|so|dylib|dll)$/i;
const OS_JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$)/;

export function parseSkillUpload(filename: string, bytes: Uint8Array): SkillImportPreview {
  if (bytes.byteLength === 0) throw new ValidationError('The uploaded file is empty');
  if (bytes.byteLength > IMPORT_LIMITS.uploadBytes) {
    throw new ValidationError(`The upload exceeds ${IMPORT_LIMITS.uploadBytes} bytes`);
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return previewFromMarkdown(decodeUtf8(bytes, filename), basename(filename), fileStem(filename), [], []);
  }
  if (lower.endsWith('.zip')) return previewFromZip(bytes, filename);
  throw new ValidationError('Unsupported file type: upload a .md file or a .zip archive');
}

function previewFromZip(bytes: Uint8Array, filename: string): SkillImportPreview {
  const listed: string[] = [];
  let entries = 0;
  let unpacked = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      // Only Markdown is ever decompressed; everything else is merely listed.
      filter: (file) => {
        if (file.name.endsWith('/') || OS_JUNK.test(file.name)) return false;
        entries += 1;
        unpacked += file.originalSize;
        if (entries > IMPORT_LIMITS.entries) {
          throw new ValidationError(`The archive has more than ${IMPORT_LIMITS.entries} files`);
        }
        if (unpacked > IMPORT_LIMITS.unpackedBytes) {
          throw new ValidationError(`The archive unpacks to more than ${IMPORT_LIMITS.unpackedBytes} bytes`);
        }
        listed.push(file.name);
        return /\.md$/i.test(file.name);
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('The file is not a readable .zip archive');
  }

  const core = pickCore(Object.keys(files));
  const ignored = listed.filter((name) => name !== core).sort();
  const executables = ignored.filter((name) => EXECUTABLE.test(name) || /(^|\/)scripts\//.test(name));
  const warnings =
    executables.length > 0
      ? [`${executables.length} executable file(s) were ignored: they are never run, stored, or sent to a model.`]
      : [];
  const stem = core.includes('/') ? core.split('/').slice(-2, -1)[0]! : fileStem(filename);
  return previewFromMarkdown(decodeUtf8(files[core]!, core), core, stem, ignored, warnings);
}

/** SKILL.md at the root → the only nested SKILL.md → the only Markdown file. */
function pickCore(markdown: string[]): string {
  const skillMd = markdown.filter((name) => basename(name).toLowerCase() === 'skill.md');
  const root = skillMd.find((name) => !name.includes('/'));
  if (root) return root;
  if (skillMd.length === 1) return skillMd[0]!;
  if (skillMd.length === 0 && markdown.length === 1) return markdown[0]!;
  if (skillMd.length > 1) throw new ValidationError('The archive contains several SKILL.md files; keep exactly one');
  throw new ValidationError('No skill core found: add a SKILL.md (or a single .md file) to the archive');
}

function previewFromMarkdown(
  raw: string,
  sourceFile: string,
  fallbackName: string,
  ignored: string[],
  warnings: string[],
): SkillImportPreview {
  const { meta, body } = splitFrontmatter(raw.replace(/^﻿/, ''));
  const trimmed = body.trim();
  if (!trimmed) throw new ValidationError(`${sourceFile} has no skill body`);
  if (trimmed.length > IMPORT_LIMITS.bodyChars) {
    throw new ValidationError(`${sourceFile} exceeds ${IMPORT_LIMITS.bodyChars} characters`);
  }
  const heading = trimmed.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim();
  const type = SkillType.safeParse(meta.type);
  return {
    name: (meta.name || heading || fallbackName || 'Imported skill').slice(0, 120),
    description: (meta.description ?? '').slice(0, 2_000),
    type: type.success ? type.data : 'custom',
    body: trimmed,
    source_file: sourceFile,
    ignored_files: ignored,
    warnings,
  };
}

/**
 * Minimal YAML frontmatter reader: top-level `key: value` scalars, quoted
 * values, and `>` / `|` block scalars. Only name/description/type are used.
 */
export function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  const lines = match[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const kv = lines[i]!.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    let value = rawValue!.trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const block: string[] = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      value = block.join(value.startsWith('>') ? ' ' : '\n').trim();
    } else {
      value = value.replace(/^(['"])(.*)\1$/, '$2');
    }
    meta[key!] = value;
  }
  return { meta, body: text.slice(match[0].length) };
}

function decodeUtf8(bytes: Uint8Array, name: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ValidationError(`${name} is not valid UTF-8 text`);
  }
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function fileStem(path: string): string {
  return basename(path).replace(/\.[^.]+$/, '');
}
