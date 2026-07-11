import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findDaysSinceLastReport } from "../../src/collect/index.js";

test("findDaysSinceLastReport returns null when directory does not exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-days-test-"));
  const result = await findDaysSinceLastReport(join(dir, "nonexistent"));
  assert.equal(result, null);
});

test("findDaysSinceLastReport returns null when directory is empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-days-test-"));
  const reportsDir = join(dir, "reports");
  await mkdir(reportsDir);
  const result = await findDaysSinceLastReport(reportsDir);
  assert.equal(result, null);
});

test("findDaysSinceLastReport returns null when no date-named .md files exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-days-test-"));
  const reportsDir = join(dir, "reports");
  await mkdir(reportsDir);
  await writeFile(join(reportsDir, "index.md"), "# Index\n", "utf8");
  await writeFile(join(reportsDir, "README.md"), "# README\n", "utf8");
  await writeFile(join(reportsDir, "index.html"), "<html></html>", "utf8");

  const result = await findDaysSinceLastReport(reportsDir);
  assert.equal(result, null);
});

test("findDaysSinceLastReport returns a positive number for a report from today", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-days-test-"));
  const reportsDir = join(dir, "reports");
  await mkdir(reportsDir);

  // Create a report dated today
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  await writeFile(join(reportsDir, `${dateStr}.md`), "# Test\n", "utf8");

  const result = await findDaysSinceLastReport(reportsDir);
  assert.ok(result !== null, "should find the today report");
  assert.ok(result! >= 1, "should return at least 1 day");
});

test("findDaysSinceLastReport picks the most recent report when multiple exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-days-test-"));
  const reportsDir = join(dir, "reports");
  await mkdir(reportsDir);

  const pad = (n: number) => String(n).padStart(2, "0");

  // Create a report from 30 days ago
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 30);
  const oldDateStr = `${oldDate.getFullYear()}-${pad(oldDate.getMonth() + 1)}-${pad(oldDate.getDate())}`;
  await writeFile(join(reportsDir, `${oldDateStr}.md`), "# Old\n", "utf8");

  // Create a report from 1 day ago
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 1);
  const recentDateStr = `${recentDate.getFullYear()}-${pad(recentDate.getMonth() + 1)}-${pad(recentDate.getDate())}`;
  await writeFile(join(reportsDir, `${recentDateStr}.md`), "# Recent\n", "utf8");

  const result = await findDaysSinceLastReport(reportsDir);
  assert.ok(result !== null, "should find reports");

  // Days since 1 day ago should be roughly 2 (ceil(1) + 1)
  assert.ok(result! <= 4, "should return a small number for a 1-day-old report");
  assert.ok(result! >= 1, "should be a positive number");
});

test("findDaysSinceLastReport ignores .html files and non-date patterns", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-days-test-"));
  const reportsDir = join(dir, "reports");
  await mkdir(reportsDir);

  // Create non-matching files
  await writeFile(join(reportsDir, "2026-06.html"), "<html></html>", "utf8");
  await writeFile(join(reportsDir, "report-june.md"), "# Report\n", "utf8");
  await writeFile(join(reportsDir, "2026.md"), "# Year only\n", "utf8");

  const result = await findDaysSinceLastReport(reportsDir);
  assert.equal(result, null, "non-date-pattern files should be ignored");
});
