// The URL piece for a player's page (/players/<slug>), from their name.
// Never use User.pickSlug for this - that's their private pick link.
// Kept dependency-free so client components can use it too.
export const playerSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
