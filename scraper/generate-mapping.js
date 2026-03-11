#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");

const INPUT_OLD = path.join(DATA_DIR, "old-guide.json");
const INPUT_NEW = path.join(DATA_DIR, "new-guide.json");
const OUTPUT_MAPPING = path.join(DATA_DIR, "mapping.json");

const THRESHOLDS = {
  fuzzyMatch: 0.82,
  strongTextMatch: 0.97,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureInputFilesExist() {
  const missing = [INPUT_OLD, INPUT_NEW].filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(
      `Missing input files: ${missing.join(", ")}. Run \"npm run scrape\" first.`
    );
  }
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1);
}

function toTokenSet(text) {
  return new Set(tokenize(text));
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function overlapSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersection += 1;
    }
  }

  return intersection / Math.min(setA.size, setB.size);
}

function textSimilarity(aText, bText) {
  const normA = normalizeText(aText);
  const normB = normalizeText(bText);

  if (normA && normA === normB) {
    return 1;
  }

  const setA = toTokenSet(normA);
  const setB = toTokenSet(normB);

  const jaccard = jaccardSimilarity(setA, setB);
  const overlap = overlapSimilarity(setA, setB);

  // Weighted blend favors overlap to catch "mostly same step" edits.
  return Math.max(jaccard * 0.45 + overlap * 0.55, 0);
}

function lcsExactMatch(oldSteps, newSteps) {
  const oldNorm = oldSteps.map((step) => normalizeText(step.text));
  const newNorm = newSteps.map((step) => normalizeText(step.text));

  const rows = oldNorm.length + 1;
  const cols = newNorm.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (oldNorm[i - 1] === newNorm[j - 1] && oldNorm[i - 1] !== "") {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const pairs = [];
  let i = oldNorm.length;
  let j = newNorm.length;

  while (i > 0 && j > 0) {
    if (oldNorm[i - 1] === newNorm[j - 1] && oldNorm[i - 1] !== "") {
      pairs.push([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return pairs.reverse();
}

function buildChapterMappings(oldChapter, newChapter, chapterNumber) {
  const oldSteps = oldChapter.steps || [];
  const newSteps = newChapter.steps || [];

  const mappings = [];
  const usedOld = new Set();
  const usedNew = new Set();

  const lcsPairs = lcsExactMatch(oldSteps, newSteps);
  for (const [oldIndex, newIndex] of lcsPairs) {
    usedOld.add(oldIndex);
    usedNew.add(newIndex);
    mappings.push({
      chapter: chapterNumber,
      oldId: oldSteps[oldIndex].id,
      newId: newSteps[newIndex].id,
      oldStep: oldSteps[oldIndex].number,
      newStep: newSteps[newIndex].number,
      category: "unchanged",
      similarity: 1,
      note: null,
    });
  }

  // Exact text matches that were not part of the ordered LCS are considered reordered.
  const newNormToIndexes = new Map();
  for (let newIndex = 0; newIndex < newSteps.length; newIndex += 1) {
    if (usedNew.has(newIndex)) {
      continue;
    }
    const key = normalizeText(newSteps[newIndex].text);
    if (!key) {
      continue;
    }
    if (!newNormToIndexes.has(key)) {
      newNormToIndexes.set(key, []);
    }
    newNormToIndexes.get(key).push(newIndex);
  }

  for (let oldIndex = 0; oldIndex < oldSteps.length; oldIndex += 1) {
    if (usedOld.has(oldIndex)) {
      continue;
    }

    const oldKey = normalizeText(oldSteps[oldIndex].text);
    const candidates = oldKey ? newNormToIndexes.get(oldKey) || [] : [];
    if (candidates.length === 0) {
      continue;
    }

    candidates.sort((a, b) => Math.abs(a - oldIndex) - Math.abs(b - oldIndex));
    const selectedNewIndex = candidates.shift();

    if (candidates.length === 0) {
      newNormToIndexes.delete(oldKey);
    } else {
      newNormToIndexes.set(oldKey, candidates);
    }

    usedOld.add(oldIndex);
    usedNew.add(selectedNewIndex);

    mappings.push({
      chapter: chapterNumber,
      oldId: oldSteps[oldIndex].id,
      newId: newSteps[selectedNewIndex].id,
      oldStep: oldSteps[oldIndex].number,
      newStep: newSteps[selectedNewIndex].number,
      category: "reordered",
      similarity: 1,
      note: `Moved from step ${oldSteps[oldIndex].number} to step ${newSteps[selectedNewIndex].number}`,
    });
  }

  const fuzzyCandidates = [];
  for (let oldIndex = 0; oldIndex < oldSteps.length; oldIndex += 1) {
    if (usedOld.has(oldIndex)) {
      continue;
    }

    for (let newIndex = 0; newIndex < newSteps.length; newIndex += 1) {
      if (usedNew.has(newIndex)) {
        continue;
      }

      const similarity = textSimilarity(oldSteps[oldIndex].text, newSteps[newIndex].text);
      if (similarity < THRESHOLDS.fuzzyMatch) {
        continue;
      }

      fuzzyCandidates.push({ oldIndex, newIndex, similarity });
    }
  }

  fuzzyCandidates.sort((a, b) => {
    if (b.similarity !== a.similarity) {
      return b.similarity - a.similarity;
    }
    return Math.abs(a.oldIndex - a.newIndex) - Math.abs(b.oldIndex - b.newIndex);
  });

  for (const candidate of fuzzyCandidates) {
    if (usedOld.has(candidate.oldIndex) || usedNew.has(candidate.newIndex)) {
      continue;
    }

    usedOld.add(candidate.oldIndex);
    usedNew.add(candidate.newIndex);

    const oldStep = oldSteps[candidate.oldIndex];
    const newStep = newSteps[candidate.newIndex];
    const oldPos = oldStep.number;
    const newPos = newStep.number;
    const positionDelta = Math.abs(oldPos - newPos);

    const isLikelyReordered =
      candidate.similarity >= THRESHOLDS.strongTextMatch && positionDelta > 2;

    const category = isLikelyReordered ? "reordered" : "modified";

    mappings.push({
      chapter: chapterNumber,
      oldId: oldStep.id,
      newId: newStep.id,
      oldStep: oldPos,
      newStep: newPos,
      category,
      similarity: Number(candidate.similarity.toFixed(4)),
      note:
        category === "reordered"
          ? `Likely moved from step ${oldPos} to step ${newPos}`
          : `Text changed (similarity ${candidate.similarity.toFixed(2)})`,
    });
  }

  for (let oldIndex = 0; oldIndex < oldSteps.length; oldIndex += 1) {
    if (usedOld.has(oldIndex)) {
      continue;
    }

    const step = oldSteps[oldIndex];
    mappings.push({
      chapter: chapterNumber,
      oldId: step.id,
      newId: null,
      oldStep: step.number,
      newStep: null,
      category: "removed",
      similarity: null,
      note: "Step exists only in old guide",
    });
  }

  for (let newIndex = 0; newIndex < newSteps.length; newIndex += 1) {
    if (usedNew.has(newIndex)) {
      continue;
    }

    const step = newSteps[newIndex];
    mappings.push({
      chapter: chapterNumber,
      oldId: null,
      newId: step.id,
      oldStep: null,
      newStep: step.number,
      category: "added",
      similarity: null,
      note: "Step exists only in new guide",
    });
  }

  mappings.sort((a, b) => {
    const aAnchor = a.newStep !== null ? a.newStep : Number.MAX_SAFE_INTEGER;
    const bAnchor = b.newStep !== null ? b.newStep : Number.MAX_SAFE_INTEGER;

    if (aAnchor !== bAnchor) {
      return aAnchor - bAnchor;
    }

    const aOld = a.oldStep !== null ? a.oldStep : Number.MAX_SAFE_INTEGER;
    const bOld = b.oldStep !== null ? b.oldStep : Number.MAX_SAFE_INTEGER;

    if (aOld !== bOld) {
      return aOld - bOld;
    }

    return a.category.localeCompare(b.category);
  });

  const stats = {
    chapter: chapterNumber,
    title: newChapter.title || oldChapter.title || `Chapter ${chapterNumber}`,
    counts: {
      unchanged: 0,
      modified: 0,
      added: 0,
      removed: 0,
      reordered: 0,
    },
  };

  mappings.forEach((mapping) => {
    stats.counts[mapping.category] += 1;
  });

  return { mappings, stats };
}

function generateMapping(oldGuide, newGuide) {
  const chapterCount = Math.max(oldGuide.chapters.length, newGuide.chapters.length);

  const allMappings = [];
  const chapterStats = [];

  for (let index = 0; index < chapterCount; index += 1) {
    const oldChapter = oldGuide.chapters[index] || { title: `Chapter ${index + 1}`, steps: [] };
    const newChapter = newGuide.chapters[index] || { title: `Chapter ${index + 1}`, steps: [] };

    const chapterResult = buildChapterMappings(oldChapter, newChapter, index + 1);
    allMappings.push(...chapterResult.mappings);
    chapterStats.push(chapterResult.stats);
  }

  const totals = {
    unchanged: 0,
    modified: 0,
    added: 0,
    removed: 0,
    reordered: 0,
  };

  chapterStats.forEach((chapter) => {
    totals.unchanged += chapter.counts.unchanged;
    totals.modified += chapter.counts.modified;
    totals.added += chapter.counts.added;
    totals.removed += chapter.counts.removed;
    totals.reordered += chapter.counts.reordered;
  });

  return {
    generatedAt: new Date().toISOString(),
    oldGuideUpdatedOn: oldGuide.updatedOn || null,
    newGuideUpdatedOn: newGuide.updatedOn || null,
    thresholds: THRESHOLDS,
    chapterStats,
    totals,
    mappings: allMappings,
  };
}

function printSummary(mappingResult) {
  console.log("\nMAPPING SUMMARY");
  console.log(`Generated at: ${mappingResult.generatedAt}`);

  mappingResult.chapterStats.forEach((chapter) => {
    console.log(
      `- Chapter ${chapter.chapter}: ` +
        `unchanged=${chapter.counts.unchanged}, ` +
        `modified=${chapter.counts.modified}, ` +
        `reordered=${chapter.counts.reordered}, ` +
        `added=${chapter.counts.added}, ` +
        `removed=${chapter.counts.removed}`
    );
  });

  console.log("Totals:", mappingResult.totals);
}

function main() {
  ensureInputFilesExist();

  const oldGuide = readJson(INPUT_OLD);
  const newGuide = readJson(INPUT_NEW);
  const mapping = generateMapping(oldGuide, newGuide);

  fs.writeFileSync(OUTPUT_MAPPING, JSON.stringify(mapping, null, 2), "utf8");

  printSummary(mapping);
  console.log(`Saved mapping to ${OUTPUT_MAPPING}`);
}

try {
  main();
} catch (error) {
  console.error("Failed to generate mapping:", error.message);
  process.exitCode = 1;
}
