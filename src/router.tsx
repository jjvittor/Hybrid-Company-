import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { nonceHeader } from "./lib/security-headers";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const getNonce = createIsomorphicFn()
  .server(() => getRequestHeader(nonceHeader))
  .client(() => document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce);

export const getRouter = () => {
  const queryClient = new QueryClient();

  const nonce = getNonce();
  const router = createRouter({
    routeTree,
    ssr: nonce ? { nonce } : {},
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
