const crypto = require("crypto");
const slugify = require("@sindresorhus/slugify");

function shortHash(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 8);
}

function segmentToSlug(segment) {
  const raw = String(segment || "").trim();
  const base = slugify(raw, { separator: "-", lowercase: true });

  // `@sindresorhus/slugify` drops many non-latin characters; for Chinese titles
  // this can collapse to just a number like "001" and cause conflicts.
  const numericPrefix = (raw.match(/^\d+(?:\.\d+)*/) || [null])[0];
  let out = base || numericPrefix || "note";

  const hasNonAscii = /[^\x00-\x7F]/.test(raw);
  const needsHash = hasNonAscii || !base || base.length < 3 || raw.length > 40;
  if (needsHash) out = `${out}-${shortHash(raw)}`;

  // Avoid ENAMETOOLONG on deep/long directory names.
  if (out.length > 60) out = `${out.slice(0, 50)}-${shortHash(raw)}`;

  return out;
}

function relPathToPermalinkPath(relPath) {
  return String(relPath || "")
    .split("/")
    .filter(Boolean)
    .map(segmentToSlug)
    .join("/");
}

module.exports = () => {
  return {
    layout: "layouts/note.njk",
    tags: ["note"],
    eleventyComputed: {
      mindmapPlugin: (data) => data["mindmap-plugin"] || data.mindmapPlugin || "",
    },
    permalink: (data) => {
      const stem = data?.page?.filePathStem || "";
      const rel = stem.replace(/^\/notes\//, "");
      return `notes/${relPathToPermalinkPath(rel)}/`;
    },
  };
};

