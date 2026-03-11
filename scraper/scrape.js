#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");

const GUIDE_SOURCES = {
  old: {
    outputFile: "old-guide.json",
    sourceUrl: "https://umkyzn.github.io/BRUHsailer/data/guide_data_landlubber.json",
  },
  new: {
    outputFile: "new-guide.json",
    sourceUrl: "https://umkyzn.github.io/BRUHsailer/data/guide_data.json",
  },
};

function sanitizeTextSegment(input) {
  return String(input || "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n?/g, "\n");
}

function extractInlineText(node) {
  if (node === null || node === undefined) {
    return "";
  }

  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return sanitizeTextSegment(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractInlineText).join("");
  }

  if (typeof node === "object") {
    if (typeof node.text === "string") {
      return sanitizeTextSegment(node.text);
    }

    if (Array.isArray(node.content)) {
      return extractInlineText(node.content);
    }

    if (Array.isArray(node.children)) {
      return extractInlineText(node.children);
    }

    if (typeof node.value === "string") {
      return sanitizeTextSegment(node.value);
    }

    if (typeof node.html === "string") {
      return sanitizeTextSegment(node.html);
    }

    return "";
  }

  return "";
}

function normalizeLineSpacing(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function toComparisonText(displayText) {
  return String(displayText || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStepDisplayText(step) {
  const lines = [];

  if (step && step.content !== undefined) {
    const mainText = extractInlineText(step.content);
    const mainLines = mainText
      .split("\n")
      .map((line) => normalizeLineSpacing(line))
      .filter(Boolean);

    if (mainLines.length > 0) {
      lines.push(mainLines.join("\n"));
    }
  }

  if (step && Array.isArray(step.nestedContent) && step.nestedContent.length > 0) {
    step.nestedContent.forEach((nestedItem) => {
      const nestedText = extractInlineText(nestedItem && nestedItem.content ? nestedItem.content : nestedItem);
      const nestedLines = nestedText
        .split("\n")
        .map((line) => normalizeLineSpacing(line))
        .filter(Boolean);

      if (nestedLines.length === 0) {
        return;
      }

      const level =
        nestedItem && Number.isFinite(nestedItem.level) ? Math.max(1, nestedItem.level) : 1;
      const indent = "  ".repeat(level - 1);
      nestedLines.forEach((line) => {
        lines.push(indent + "- " + line);
      });
    });
  }

  if (step && step.metadata && typeof step.metadata === "object") {
    if (typeof step.metadata.notes === "string") {
      const noteLines = sanitizeTextSegment(step.metadata.notes)
        .split("\n")
        .map((line) => normalizeLineSpacing(line))
        .filter(Boolean);

      noteLines.forEach((line) => lines.push(line));
    }
  }

  return lines.join("\n").trim();
}

function normalizeGuide(rawGuide, guideName, sourceUrl) {
  if (!rawGuide || !Array.isArray(rawGuide.chapters)) {
    throw new Error(`Guide ${guideName} does not contain a valid chapters array`);
  }

  const normalizedChapters = rawGuide.chapters.map((chapter, chapterIndex) => {
    let chapterStepNumber = 0;
    const chapterSteps = [];

    const sections = Array.isArray(chapter.sections) ? chapter.sections : [];

    sections.forEach((section, sectionIndex) => {
      const steps = Array.isArray(section.steps) ? section.steps : [];
      steps.forEach((step) => {
        chapterStepNumber += 1;

        const displayText = buildStepDisplayText(step);
        const comparisonText = toComparisonText(displayText);

        chapterSteps.push({
          id: `${guideName}-${chapterIndex + 1}-${chapterStepNumber}`,
          number: chapterStepNumber,
          text: comparisonText,
          displayText,
          section: {
            index: sectionIndex + 1,
            title: section.title || null,
          },
          metadata: step && step.metadata ? step.metadata : {},
        });
      });
    });

    return {
      title: chapter.title || `Chapter ${chapterIndex + 1}`,
      steps: chapterSteps,
    };
  });

  return {
    guide: guideName,
    sourceUrl,
    scrapedAt: new Date().toISOString(),
    updatedOn: rawGuide.updatedOn || null,
    chapters: normalizedChapters,
  };
}

function fetchJsonWithHttps(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const { statusCode } = res;

        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode} for ${url}`));
          res.resume();
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf8");
            resolve(JSON.parse(raw));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchJson(url) {
  if (typeof fetch === "function") {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  }

  return fetchJsonWithHttps(url);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function formatPreview(text, limit = 100) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) {
    return clean;
  }
  return `${clean.slice(0, limit - 3)}...`;
}

function printGuideSummary(guideData) {
  console.log(`\n${guideData.guide.toUpperCase()} GUIDE SUMMARY`);
  console.log(`Source: ${guideData.sourceUrl}`);
  console.log(`Updated on source: ${guideData.updatedOn || "unknown"}`);

  guideData.chapters.forEach((chapter, index) => {
    const count = chapter.steps.length;
    const first = count > 0 ? formatPreview(chapter.steps[0].text) : "(no steps)";
    const last = count > 0 ? formatPreview(chapter.steps[count - 1].text) : "(no steps)";

    console.log(`- Chapter ${index + 1}: ${count} steps`);
    console.log(`  First: ${first}`);
    console.log(`  Last : ${last}`);
  });
}

async function scrapeGuides() {
  ensureDataDir();

  for (const [guideName, config] of Object.entries(GUIDE_SOURCES)) {
    const rawGuide = await fetchJson(config.sourceUrl);
    const normalizedGuide = normalizeGuide(rawGuide, guideName, config.sourceUrl);
    const outputPath = path.join(DATA_DIR, config.outputFile);

    fs.writeFileSync(outputPath, JSON.stringify(normalizedGuide, null, 2), "utf8");
    printGuideSummary(normalizedGuide);

    console.log(`Saved ${guideName} guide to ${outputPath}`);
  }

  console.log("\nScrape complete.");
}

scrapeGuides().catch((error) => {
  console.error("Failed to scrape guides:", error);
  process.exitCode = 1;
});
