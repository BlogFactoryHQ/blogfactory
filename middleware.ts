import { next, rewrite } from "@vercel/functions";

export default function routeRootByHostname(request: Request) {
  const url = new URL(request.url);

  if (url.hostname === "blogfactory.io") {
    url.pathname = "/marketing.html";
    return rewrite(url);
  }

  return next();
}

export const config = { matcher: "/" };
