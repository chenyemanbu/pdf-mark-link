import { build } from "esbuild";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const packageInfo = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const versions = JSON.parse(await readFile(path.join(root, "versions.json"), "utf8"));
if (manifest.version !== packageInfo.version || versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error("package.json, manifest.json, and versions.json must agree.");
}
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== manifest.version) {
  throw new Error("The release tag must match manifest.json exactly, without a v prefix.");
}

const licenses = [
  ["pdf-lib", "pdf-lib/LICENSE.md"],
  ["@pdf-lib/standard-fonts", "@pdf-lib/standard-fonts/LICENSE.md"],
  ["@pdf-lib/upng", "@pdf-lib/upng/LICENSE"],
  ["pako", "pako/LICENSE"],
  ["tslib", "tslib/LICENSE.txt"],
];
const notices = ["# Third-party notices", "", "These dependencies are bundled into main.js.", ""];
for (const [name, filename] of licenses) {
  const info = JSON.parse(await readFile(path.join(root, "node_modules", name, "package.json"), "utf8"));
  const license = await readFile(path.join(root, "node_modules", filename), "utf8");
  notices.push("## " + name + " " + info.version, "", license.trim(), "");
}
const noticeText = notices.join("\n").replaceAll("\r\n", "\n");
const outdir = path.join(root, "dist");
await mkdir(outdir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["main.js"],
  bundle: true,
  platform: "browser",
  format: "cjs",
  external: ["obsidian"],
  target: "es2022",
  outfile: path.join(outdir, "main.js"),
  minify: false,
  sourcemap: false,
  legalComments: "none",
  banner: { js: "/*\n" + noticeText.replaceAll("*/", "* /") + "\n*/" },
});
await writeFile(path.join(outdir, "THIRD_PARTY_NOTICES.md"), noticeText);
for (const filename of ["manifest.json", "styles.css", "LICENSE", "README.md"]) {
  await copyFile(path.join(root, filename), path.join(outdir, filename));
}
console.log("Built PDF Mark Link " + manifest.version + " in dist/.");
