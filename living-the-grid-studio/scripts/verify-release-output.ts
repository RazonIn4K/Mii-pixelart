import path from "node:path";

import { assertNoForbiddenReleaseSecretArtifacts } from "./release-output-hygiene";

const releaseDirectory = path.resolve("dist");

await assertNoForbiddenReleaseSecretArtifacts(releaseDirectory);
console.log("Release output secret-filename audit passed.");
