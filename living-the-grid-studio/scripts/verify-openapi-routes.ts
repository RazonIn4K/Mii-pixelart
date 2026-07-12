import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { parse } from "yaml";

type JsonRecord = Record<string, unknown>;

interface OpenApiOperation extends JsonRecord {
  operationId?: unknown;
  parameters?: unknown;
}

interface OpenApiPathItem extends JsonRecord {
  parameters?: unknown;
}

interface ContractRoute {
  expandedPaths: string[];
  genericPath: string;
  method: string;
  operationId: string;
}

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);
const ROUTE_SOURCE_FILES = [
  "worker/auth.ts",
  "worker/accounts.ts",
  "worker/creations.ts",
  "worker/creation-images.ts",
  "worker/discovery.ts",
  "worker/social.ts",
  "worker/moderation.ts",
] as const;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function localReference(document: JsonRecord, reference: string): JsonRecord {
  if (!reference.startsWith("#/")) {
    throw new Error(
      `Only local OpenAPI references are supported: ${reference}`,
    );
  }
  let value: unknown = document;
  for (const encodedPart of reference.slice(2).split("/")) {
    const part = encodedPart.replaceAll("~1", "/").replaceAll("~0", "~");
    value = record(value, reference)[part];
  }
  return record(value, reference);
}

function resolveParameter(document: JsonRecord, value: unknown): JsonRecord {
  const parameter = record(value, "OpenAPI parameter");
  const reference = parameter.$ref;
  return typeof reference === "string"
    ? localReference(document, reference)
    : parameter;
}

function parameterList(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new Error("OpenAPI parameters must be an array.");
  return value;
}

function expandContractPath(
  document: JsonRecord,
  template: string,
  pathItem: OpenApiPathItem,
  operation: OpenApiOperation,
): string[] {
  const parameters = [
    ...parameterList(pathItem.parameters),
    ...parameterList(operation.parameters),
  ].map((value) => resolveParameter(document, value));
  let paths = [template];

  for (const match of template.matchAll(/\{([^}]+)\}/gu)) {
    const name = match[1];
    const parameter = parameters.find((candidate) => candidate.name === name);
    if (!parameter)
      throw new Error(`${template} is missing its ${name} path parameter.`);
    const schema = record(parameter.schema, `${template} ${name} schema`);
    const values = Array.isArray(schema.enum)
      ? schema.enum.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const replacements = values.length > 0 ? values : [":"];
    paths = paths.flatMap((candidate) =>
      replacements.map((replacement) =>
        candidate.replace(`{${name}}`, replacement),
      ),
    );
  }

  return paths;
}

function normalizeContractPath(template: string): string {
  return template.replaceAll(/\{[^}]+\}/gu, ":");
}

function normalizeRuntimePath(routePath: string): string {
  return routePath
    .split("/")
    .map((segment) => (segment.startsWith(":") ? ":" : segment))
    .join("/");
}

function routeKey(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${routePath}`;
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

const document = record(
  parse(await readFile(path.join(ROOT, "docs/community-openapi.yaml"), "utf8")),
  "OpenAPI document",
);
const paths = record(document.paths, "OpenAPI paths");
const contractRoutes: ContractRoute[] = [];
const operationIds = new Map<string, string>();

for (const [routePath, pathValue] of Object.entries(paths)) {
  if (!routePath.startsWith("/api/")) {
    throw new Error(
      `Community OpenAPI path must start with /api/: ${routePath}`,
    );
  }
  const pathItem = record(pathValue, routePath) as OpenApiPathItem;
  for (const [method, operationValue] of Object.entries(pathItem)) {
    if (!HTTP_METHODS.has(method)) continue;
    const operation = record(
      operationValue,
      `${method.toUpperCase()} ${routePath}`,
    ) as OpenApiOperation;
    if (
      typeof operation.operationId !== "string" ||
      operation.operationId.length === 0
    ) {
      throw new Error(
        `${method.toUpperCase()} ${routePath} is missing operationId.`,
      );
    }
    const previousRoute = operationIds.get(operation.operationId);
    if (previousRoute) {
      throw new Error(
        `Duplicate operationId ${operation.operationId}: ${previousRoute} and ${routePath}`,
      );
    }
    operationIds.set(operation.operationId, routePath);
    contractRoutes.push({
      expandedPaths: expandContractPath(
        document,
        routePath,
        pathItem,
        operation,
      ),
      genericPath: normalizeContractPath(routePath),
      method,
      operationId: operation.operationId,
    });
  }
}

const runtimeRoutes = new Set<string>();
for (const relativeFile of ROUTE_SOURCE_FILES) {
  const source = await readFile(path.join(ROOT, relativeFile), "utf8");
  const sourceFile = ts.createSourceFile(
    relativeFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let found = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "add" &&
      node.arguments.length === 3
    ) {
      const [methodArgument, pathArgument] = node.arguments;
      if (
        !ts.isStringLiteralLike(methodArgument) ||
        !ts.isStringLiteralLike(pathArgument)
      ) {
        const position = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        throw new Error(
          `${relativeFile}:${position.line + 1}:${position.character + 1} must register routes with literal method and path values.`,
        );
      }
      found += 1;
      const key = routeKey(
        methodArgument.text,
        normalizeRuntimePath(pathArgument.text),
      );
      if (runtimeRoutes.has(key))
        throw new Error(`Duplicate registered route: ${key}`);
      runtimeRoutes.add(key);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (found === 0)
    throw new Error(`No literal routes found in ${relativeFile}.`);
}

const claimedRuntimeRoutes = new Set<string>();
const missingFromWorker: string[] = [];
for (const contractRoute of contractRoutes) {
  const genericKey = routeKey(contractRoute.method, contractRoute.genericPath);
  const genericRegistered = runtimeRoutes.has(genericKey);
  if (genericRegistered) claimedRuntimeRoutes.add(genericKey);
  for (const expandedPath of contractRoute.expandedPaths) {
    const expandedKey = routeKey(contractRoute.method, expandedPath);
    if (runtimeRoutes.has(expandedKey)) claimedRuntimeRoutes.add(expandedKey);
    else if (!genericRegistered)
      missingFromWorker.push(`${expandedKey} (${contractRoute.operationId})`);
  }
}
const missingFromContract = difference(runtimeRoutes, claimedRuntimeRoutes);
if (missingFromWorker.length > 0 || missingFromContract.length > 0) {
  const details = [
    missingFromWorker.length > 0
      ? `Documented but not registered:\n  ${missingFromWorker.join("\n  ")}`
      : "",
    missingFromContract.length > 0
      ? `Registered but not documented:\n  ${missingFromContract.join("\n  ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  throw new Error(`Community API route contract is out of sync.\n${details}`);
}

console.log(
  `Verified ${operationIds.size} OpenAPI operations against ${runtimeRoutes.size} registered Worker routes.`,
);
