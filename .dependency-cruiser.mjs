const SOURCE_PATH = "^(client/src|server/src|shared)";
const APP_SOURCE_PATH = "^(client/src|server/src)";
const NON_PROD_PATH = "(?:^|/)(?:__tests__/|[^/]+[.](?:test|spec)[.](?:ts|tsx)$)";

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-cycles",
      severity: "error",
      comment:
        "Keep the architecture acyclic inside client/src, server/src and shared.",
      from: {
        path: SOURCE_PATH,
        pathNot: [NON_PROD_PATH],
      },
      to: {
        circular: true,
      },
    },
    {
      name: "no-unresolved",
      severity: "error",
      comment:
        "Imports used by production code must resolve on disk or through package metadata.",
      from: {
        path: SOURCE_PATH,
        pathNot: [NON_PROD_PATH],
      },
      to: {
        couldNotResolve: true,
        pathNot: [
          "^virtual:",
          "^vite/",
        ],
      },
    },
    {
      name: "client-does-not-import-server",
      severity: "error",
      comment: "The React client must not depend on server implementation modules.",
      from: {
        path: "^client/src",
      },
      to: {
        path: "^server/src",
      },
    },
    {
      name: "server-does-not-import-client",
      severity: "error",
      comment: "The API server must not depend on client implementation modules.",
      from: {
        path: "^server/src",
      },
      to: {
        path: "^client/src",
      },
    },
    {
      name: "shared-stays-framework-agnostic",
      severity: "error",
      comment:
        "shared must stay reusable and cannot depend on client/src or server/src.",
      from: {
        path: "^shared",
      },
      to: {
        path: APP_SOURCE_PATH,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"],
    },
    exclude: {
      path: ["(^|/)(dist|coverage)(/|$)"],
    },
    includeOnly: [SOURCE_PATH],
    combinedDependencies: true,
    tsConfig: {
      fileName: "tsconfig.depcruise.json",
    },
  },
};
