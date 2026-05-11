/**
 * Category Tree for the Skill Search Engine.
 *
 * Pure functions implementing:
 * - Section path parsing
 * - Category tree building from registry entries
 * - Category browsing with tier-ordered results
 * - Fuzzy category suggestion (Levenshtein distance)
 * - JSON serialization/deserialization (round-trip)
 *
 * @module skill/category
 */

import type {
  CategoryNode,
  CategoryTree,
  SkillDescriptor,
  SkillRegistryEntry,
  Tier,
} from "./types"
import { compareTier } from "./types"

// ---------------------------------------------------------------------------
// Section path parsing
// ---------------------------------------------------------------------------

/**
 * Parse a section string into a hierarchical path.
 *
 * Examples:
 * - "Community Skills > Development and Testing" → ["Community Skills", "Development and Testing"]
 * - "Security Skills by Trail of Bits Team" → ["Security Skills by Trail of Bits Team"]
 * - "" → []
 */
export function parseSectionPath(section: string): string[] {
  if (!section || !section.trim()) return []

  return section
    .split(">")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// ---------------------------------------------------------------------------
// Category tree building
// ---------------------------------------------------------------------------

/**
 * Build a category tree from skill registry entries.
 *
 * Each skill's `section` field is parsed into a hierarchical path.
 * Skills with empty/unparseable sections go into "Uncategorized".
 *
 * Each node tracks:
 * - name: category name
 * - skillCount: total skills in this node and all descendants
 * - children: sub-categories
 * - skills: SkillDescriptors directly in this node (leaf-level or directly placed)
 */
export function buildCategoryTree(registry: SkillRegistryEntry[]): CategoryTree {
  const root: CategoryNode = {
    name: "__root__",
    skillCount: 0,
    children: [],
    skills: [],
  }

  for (const entry of registry) {
    const path = parseSectionPath(entry.section)

    if (path.length === 0) {
      // Place in "Uncategorized"
      const uncategorized = ensureChild(root, "Uncategorized")
      uncategorized.skills.push(toDescriptor(entry))
      uncategorized.skillCount++
    } else {
      // Navigate/create the path
      let current = root
      for (const segment of path) {
        current = ensureChild(current, segment)
      }
      // Place skill in the deepest node
      current.skills.push(toDescriptor(entry))
      // Increment skillCount for all nodes in the path
      let countNode: CategoryNode | undefined = root
      for (const segment of path) {
        countNode = countNode?.children.find((c) => c.name === segment)
        if (countNode) countNode.skillCount++
      }
    }
  }

  // The root's children are the top-level categories
  // Sort children alphabetically
  sortTree(root)

  return {
    roots: root.children,
    totalSkills: registry.length,
  }
}

function ensureChild(parent: CategoryNode, name: string): CategoryNode {
  let child = parent.children.find((c) => c.name === name)
  if (!child) {
    child = { name, skillCount: 0, children: [], skills: [] }
    parent.children.push(child)
  }
  return child
}

function toDescriptor(entry: SkillRegistryEntry): SkillDescriptor {
  return {
    name: entry.name,
    description: entry.description,
    tags: entry.tags,
    tier: entry.tier,
    score: 0,
  }
}

function sortTree(node: CategoryNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name))
  // Sort skills by tier priority (ALWAYS > CORE > HIGH > LONGTAIL)
  node.skills.sort((a, b) => compareTier(a.tier as Tier, b.tier as Tier))
  for (const child of node.children) {
    sortTree(child)
  }
}

// ---------------------------------------------------------------------------
// Category browsing
// ---------------------------------------------------------------------------

export interface BrowseResult {
  categories: Array<{ name: string; skillCount: number; childCount: number }>
  skills: SkillDescriptor[]
}

/**
 * Browse the category tree.
 *
 * - Without a path: returns top-level categories
 * - With a path: returns sub-categories and skills at that level
 */
export function browse(tree: CategoryTree, path?: string[]): BrowseResult {
  if (!path || path.length === 0) {
    // Return top-level categories
    return {
      categories: tree.roots.map((node) => ({
        name: node.name,
        skillCount: node.skillCount,
        childCount: node.children.length,
      })),
      skills: [],
    }
  }

  // Navigate to the specified path
  let current: CategoryNode | undefined
  let nodes = tree.roots

  for (const segment of path) {
    current = nodes.find((n) => n.name === segment)
    if (!current) {
      return {
        categories: [],
        skills: [],
      }
    }
    nodes = current.children
  }

  return {
    categories: current!.children.map((node) => ({
      name: node.name,
      skillCount: node.skillCount,
      childCount: node.children.length,
    })),
    skills: current!.skills,
  }
}

// ---------------------------------------------------------------------------
// Category suggestion (Levenshtein distance)
// ---------------------------------------------------------------------------

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost, // substitution
      )
    }
  }

  return dp[m][n]
}

/**
 * Suggest similar category names based on a query string.
 *
 * Collects all category names from the tree and returns those
 * with the smallest Levenshtein distance to the query.
 */
export function suggestCategories(tree: CategoryTree, query: string, maxResults: number = 5): string[] {
  const allNames = collectCategoryNames(tree.roots)
  const queryLower = query.toLowerCase()

  const scored = allNames.map((name) => ({
    name,
    distance: levenshtein(queryLower, name.toLowerCase()),
  }))

  scored.sort((a, b) => a.distance - b.distance)

  return scored.slice(0, maxResults).map((s) => s.name)
}

function collectCategoryNames(nodes: CategoryNode[]): string[] {
  const names: string[] = []
  for (const node of nodes) {
    names.push(node.name)
    names.push(...collectCategoryNames(node.children))
  }
  return names
}

/**
 * Find a category node by path in the tree.
 */
export function findNode(tree: CategoryTree, path: string[]): CategoryNode | undefined {
  let nodes = tree.roots
  let current: CategoryNode | undefined

  for (const segment of path) {
    current = nodes.find((n) => n.name === segment)
    if (!current) return undefined
    nodes = current.children
  }

  return current
}

// ---------------------------------------------------------------------------
// Serialization / Deserialization (round-trip)
// ---------------------------------------------------------------------------

export function serializeTree(tree: CategoryTree): string {
  return JSON.stringify(tree, null, 2)
}

export function deserializeTree(json: string): CategoryTree {
  return JSON.parse(json) as CategoryTree
}
