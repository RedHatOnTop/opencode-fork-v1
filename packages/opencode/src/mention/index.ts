/**
 * Context Mentions module barrel export
 *
 * @module mention
 */

export * as Mention from "./mention"
export {
  Service as MentionService,
  layer as mentionLayer,
  defaultLayer as mentionDefaultLayer,
  findMentions,
  MENTION_REGEX,
  type MentionMatch,
  type MentionResult,
  type MentionDefinition,
} from "./mention"
