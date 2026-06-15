"use strict";

const { build } = require("esbuild");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const packageJson = require("../package.json");

const root = path.resolve(__dirname, "..");
const outfile = path.join("dist", "LastSeen.plugin.js");

const metadata = `/**
 * @name LastSeen
 * @author kingslayerrq
 * @version ${packageJson.version}
 * @description Locally records when Discord users were last observed online.
 * @source https://github.com/kingslayerrq/discord-last-login
 * @website https://github.com/kingslayerrq/discord-last-login
 * @updateUrl https://raw.githubusercontent.com/kingslayerrq/discord-last-login/main/dist/LastSeen.plugin.js
 */`;

async function main() {
  await mkdir(path.join(root, path.dirname(outfile)), { recursive: true });
  await build({
    absWorkingDir: root,
    entryPoints: ["./src/index.js"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: ["node20"],
    banner: { js: metadata },
    legalComments: "none",
    minify: false,
    sourcemap: false
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
