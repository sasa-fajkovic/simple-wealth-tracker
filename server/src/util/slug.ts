// Convert a human-readable name into a URL-safe slug used as an entity id.
// MODEL-01 / MODEL-02: ids are immutable after create.
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
