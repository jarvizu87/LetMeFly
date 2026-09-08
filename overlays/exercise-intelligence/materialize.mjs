#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const payloadDir = path.join(here, "payload");
const manifestPath = path.join(payloadDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const fail = (message) => {
  console.error(`Exercise Intelligence payload verification failed: ${message}`);
  process.exit(1);
};

const parts = manifest.parts.map((part) => {
  const filePath = path.join(payloadDir, part.file);
  if (!fs.existsSync(filePath)) fail(`missing ${part.file}`);
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (text.length !== part.characters) {
    fail(`${part.file} length ${text.length} != ${part.characters}`);
  }
  if (sha256(text) !== part.sha256) {
    fail(`${part.file} sha256 mismatch`);
  }
  return text;
});

if (parts.length !== manifest.chunking.partCount) {
  fail(`part count ${parts.length} != ${manifest.chunking.partCount}`);
}

const encoded = parts.join("");
if (encoded.length !== manifest.base64.characters) {
  fail(`base64 length ${encoded.length} != ${manifest.base64.characters}`);
}
if (sha256(encoded) !== manifest.base64.sha256) {
  fail("concatenated base64 sha256 mismatch");
}

const gzipBytes = Buffer.from(encoded, "base64");
if (gzipBytes.length !== manifest.gzip.bytes) {
  fail(`gzip length ${gzipBytes.length} != ${manifest.gzip.bytes}`);
}
if (sha256(gzipBytes) !== manifest.gzip.sha256) {
  fail("gzip sha256 mismatch");
}

let jsonBytes;
try {
  jsonBytes = zlib.gunzipSync(gzipBytes);
} catch (error) {
  fail(`gunzip failed: ${error.message}`);
}
if (jsonBytes.length !== manifest.source.bytes) {
  fail(`JSON length ${jsonBytes.length} != ${manifest.source.bytes}`);
}
if (sha256(jsonBytes) !== manifest.source.sha256) {
  fail("JSON sha256 mismatch");
}

let payload;
try {
  payload = JSON.parse(jsonBytes.toString("utf8"));
} catch (error) {
  fail(`JSON parse failed: ${error.message}`);
}

if (payload?.counts?.exercises !== manifest.source.exerciseCount) {
  fail(`exercise count ${payload?.counts?.exercises} != ${manifest.source.exerciseCount}`);
}
if (payload?.counts?.substitutionRules !== manifest.source.substitutionRuleCount) {
  fail(`substitution count ${payload?.counts?.substitutionRules} != ${manifest.source.substitutionRuleCount}`);
}

const verifyOnly = process.argv.includes("--verify-only");
const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
if (!verifyOnly) {
  const outputPath = outputArg
    ? path.resolve(outputArg.slice("--output=".length))
    : path.join(here, "materialized", manifest.source.filename);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, jsonBytes);
  console.log(`Materialized ${outputPath}`);
}

console.log(
  `Exercise Intelligence payload: PASS (${manifest.source.exerciseCount} exercises, ${manifest.source.substitutionRuleCount} substitution rules)`
);
