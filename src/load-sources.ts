import { readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";
import { sources as defaultSources, type Source, type SourceTier } from "./sources.js";

type RawSource = {
  id?: string;
  name?: string;
  url?: string;
  feedUrl?: string;
  tier?: number;
};

type RawSourcesFile = {
  sources?: RawSource[];
};

export async function loadSources(rootDir: string = process.cwd()): Promise<Source[]> {
  const yamlPath = join(rootDir, "sources.yaml");

  try {
    const raw = await readFile(yamlPath, "utf8");
    const parsed = yaml.load(raw) as RawSourcesFile;

    if (!parsed || !Array.isArray(parsed.sources) || parsed.sources.length === 0) {
      console.warn(`sources.yaml found but empty or invalid, using default sources`);
      return defaultSources;
    }

    const sources: Source[] = [];
    for (const [index, raw] of parsed.sources.entries()) {
      const source = validateSource(raw, index);
      if (source) {
        sources.push(source);
      }
    }

    if (sources.length === 0) {
      console.warn(`sources.yaml found but no valid sources, using default sources`);
      return defaultSources;
    }

    console.log(`Loaded ${sources.length} sources from sources.yaml`);
    return sources;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return defaultSources;
    }
    throw error;
  }
}

function validateSource(raw: RawSource, index: number): Source | null {
  if (!raw.id || !raw.name || !raw.feedUrl) {
    console.warn(`  Skipping source at index ${index}: missing required fields (id, name, feedUrl)`);
    return null;
  }

  const tier = raw.tier === 1 ? 1 : 2;

  return {
    id: raw.id,
    name: raw.name,
    url: raw.url ?? "",
    feedUrl: raw.feedUrl,
    tier,
  };
}
