import { Npm } from "@opencode-ai/core/npm"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Bus } from "@/bus"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Ripgrep } from "@/file/ripgrep"
import { File } from "@/file"
import { FileWatcher } from "@/file/watcher"
import { Storage } from "@/storage/storage"
import { Snapshot } from "@/snapshot"
import { Plugin } from "@/plugin"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { Provider } from "@/provider/provider"
import { ProviderAuth } from "@/provider/auth"
import { Account } from "@/account/account"
import { Agent } from "@/agent/agent"
import { Skill } from "@/skill"
import { Discovery } from "@/skill/discovery"
import { Question } from "@/question"
import { Permission } from "@/permission"
import { Todo } from "@/session/todo"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { SessionRunState } from "@/session/run-state"
import { SessionProcessor } from "@/session/processor"
import { SessionCompaction } from "@/session/compaction"
import { SessionRevert } from "@/session/revert"
import { SessionSummary } from "@/session/summary"
import { SessionPrompt } from "@/session/prompt"
import { Instruction } from "@/session/instruction"
import { LLM } from "@/session/llm"
import { LSP } from "@/lsp/lsp"
import { MCP } from "@/mcp"
import { McpAuth } from "@/mcp/auth"
import { Command } from "@/command"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { Format } from "@/format"
import { InstanceLayer } from "@/project/instance-layer"
import { Project } from "@/project/project"
import { Vcs } from "@/project/vcs"
import { Reference } from "@/reference/reference"
import { Workspace } from "@/control-plane/workspace"
import { Worktree } from "@/worktree"
import { Pty } from "@/pty"
import { PtyTicket } from "@/pty/ticket"
import { Installation } from "@/installation"
import { ShareNext } from "@/share/share-next"
import { SessionShare } from "@/share/session"
import { SyncEvent } from "@/sync"
import { EventV2Bridge } from "@/event-v2-bridge"
import { DataMigration } from "@/data-migration"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"

import { Layer, ManagedRuntime, Effect } from "effect"

const layers = {
  Npm: Npm.defaultLayer,
  AppFileSystem: AppFileSystem.defaultLayer,
  Bus: Bus.defaultLayer,
  Auth: Auth.defaultLayer,
  Config: Config.defaultLayer,
  Git: Git.defaultLayer,
  Ripgrep: Ripgrep.defaultLayer,
  File: File.defaultLayer,
  FileWatcher: FileWatcher.defaultLayer,
  Storage: Storage.defaultLayer,
  Snapshot: Snapshot.defaultLayer,
  Plugin: Plugin.defaultLayer,
  ModelsDev: ModelsDev.defaultLayer,
  Provider: Provider.defaultLayer,
  ProviderAuth: ProviderAuth.defaultLayer,
  Account: Account.defaultLayer,
  Agent: Agent.defaultLayer,
  Skill: Skill.defaultLayer,
  Discovery: Discovery.defaultLayer,
  Question: Question.defaultLayer,
  Permission: Permission.defaultLayer,
  Todo: Todo.defaultLayer,
  Session: Session.defaultLayer,
  SessionStatus: SessionStatus.defaultLayer,
  BackgroundJob: BackgroundJob.defaultLayer,
  RuntimeFlags: RuntimeFlags.defaultLayer,
  SessionRunState: SessionRunState.defaultLayer,
  SessionProcessor: SessionProcessor.defaultLayer,
  SessionCompaction: SessionCompaction.defaultLayer,
  SessionRevert: SessionRevert.defaultLayer,
  SessionSummary: SessionSummary.defaultLayer,
  SessionPrompt: SessionPrompt.defaultLayer,
  Instruction: Instruction.defaultLayer,
  LLM: LLM.defaultLayer,
  LSP: LSP.defaultLayer,
  MCP: MCP.defaultLayer,
  McpAuth: McpAuth.defaultLayer,
  Command: Command.defaultLayer,
  Truncate: Truncate.defaultLayer,
  ToolRegistry: ToolRegistry.defaultLayer,
  Format: Format.defaultLayer,
  Project: Project.defaultLayer,
  Vcs: Vcs.defaultLayer,
  Reference: Reference.defaultLayer,
  Workspace: Workspace.defaultLayer,
  Worktree: Worktree.defaultLayer,
  Pty: Pty.defaultLayer,
  PtyTicket: PtyTicket.defaultLayer,
  Installation: Installation.defaultLayer,
  ShareNext: ShareNext.defaultLayer,
  SessionShare: SessionShare.defaultLayer,
  SyncEvent: SyncEvent.defaultLayer,
  EventV2Bridge: EventV2Bridge.defaultLayer,
  DataMigration: DataMigration.defaultLayer,
}

async function testLayers() {
  for (const [name, layer] of Object.entries(layers)) {
    try {
      const rt = ManagedRuntime.make(layer)
      await rt.runPromise(Effect.void)
      console.log(`${name}: OK`)
    } catch (e) {
      console.error(`${name} failed:`, e.message)
    }
  }
}

testLayers().catch(console.error)
