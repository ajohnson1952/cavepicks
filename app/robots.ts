import type { MetadataRoute } from "next";

// Private site for one friend group - no reason to be crawled. Every page
// reads fresh from the database, so each crawler hit would wake Neon's
// compute (free plan, fixed monthly allowance - see CLAUDE.md). This only
// stops well-behaved crawlers; misbehaving bots ignore robots.txt and would
// need blocking in Vercel's firewall instead.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
