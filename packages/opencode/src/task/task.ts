import { Context, Effect, Schema, Layer } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import path from "path"

const log = Log.create({ service: "task" })
const TASKS_FILE = ".opencode/tasks.json"

// ============================================================================
// Schema Definitions
// ============================================================================

export const TaskStatus = Schema.Literals(["pending", "in_progress", "completed"])
export type TaskStatus = Schema.Schema.Type<typeof TaskStatus>

export class TaskItem extends Schema.Class<TaskItem>("TaskItem")({
  id: Schema.String,
  subject: Schema.String,
  description: Schema.String,
  status: TaskStatus,
  owner: Schema.optional(Schema.String),
  blocks: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  blockedBy: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}) {}

export const TaskSummary = Schema.Struct({
  total: Schema.Number,
  pending: Schema.Number,
  inProgress: Schema.Number,
  completed: Schema.Number,
})

export type TaskSummary = Schema.Schema.Type<typeof TaskSummary>

// ============================================================================
// Errors
// ============================================================================

export class CircularDependencyError extends Schema.TaggedErrorClass<CircularDependencyError>()("CircularDependencyError", {
  message: Schema.String,
}) {}

export class TaskNotFoundError extends Schema.TaggedErrorClass<TaskNotFoundError>()("TaskNotFoundError", {
  id: Schema.String,
}) {}

export class InvalidStatusTransitionError extends Schema.TaggedErrorClass<InvalidStatusTransitionError>()("InvalidStatusTransitionError", {
  id: Schema.String,
  from: TaskStatus,
  to: TaskStatus,
}) {}

export type TaskError = CircularDependencyError | TaskNotFoundError | InvalidStatusTransitionError

// ============================================================================
// State
// ============================================================================

type TaskState = {
  tasks: Map<string, TaskItem>
  activeTaskId: string | undefined
  projectRoot: string | undefined
}

const makeState = (): TaskState => ({
  tasks: new Map(),
  activeTaskId: undefined,
  projectRoot: undefined,
})

// ============================================================================
// File Persistence
// ============================================================================

const serializeTasks = (tasks: Map<string, TaskItem>): string =>
  JSON.stringify(
    Array.from(tasks.values()).sort((a, b) => a.createdAt - b.createdAt),
    null,
    2,
  )

const deserializeTasks = (data: string): TaskItem[] => {
  const parsed = JSON.parse(data)
  if (!Array.isArray(parsed)) throw new Error("Invalid tasks file format")
  return parsed.map((item) => new TaskItem(item))
}

// ============================================================================
// Utility Functions
// ============================================================================

const generateId = (): string =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`

const hasCycle = (taskId: string, blocks: string[], state: TaskState, visited = new Set<string>()): boolean => {
  if (visited.has(taskId)) return true
  visited.add(taskId)

  for (const blockedId of blocks) {
    const blockedTask = state.tasks.get(blockedId)
    if (!blockedTask) continue
    if (blockedTask.blockedBy?.includes(taskId)) return true
    if (blockedTask.blocks) {
      if (hasCycle(taskId, blockedTask.blocks, state, new Set(visited))) return true
    }
  }

  return false
}

const canStartTask = (task: TaskItem, state: TaskState): boolean => {
  if (task.status !== "pending") return false
  if (state.activeTaskId !== undefined && state.activeTaskId !== task.id) return false

  if (task.blockedBy) {
    for (const blockerId of task.blockedBy) {
      const blocker = state.tasks.get(blockerId)
      if (!blocker || blocker.status !== "completed") return false
    }
  }

  return true
}

// ============================================================================
// Service Interface
// ============================================================================

export interface Interface {
  readonly create: (task: Omit<TaskItem, "id" | "status" | "createdAt" | "updatedAt">) => Effect.Effect<TaskItem, TaskError>
  readonly updateStatus: (id: string, status: TaskStatus) => Effect.Effect<void, TaskError>
  readonly list: () => Effect.Effect<ReadonlyArray<TaskItem>>
  readonly get: (id: string) => Effect.Effect<TaskItem, TaskError>
  readonly canStart: (id: string) => Effect.Effect<boolean, TaskError>
  readonly summary: () => Effect.Effect<TaskSummary>
  readonly activeTask: () => Effect.Effect<TaskItem | undefined>
  readonly delete: (id: string) => Effect.Effect<void, TaskError>
  readonly addDependency: (taskId: string, dependsOnId: string) => Effect.Effect<void, TaskError>
  readonly removeDependency: (taskId: string, dependsOnId: string) => Effect.Effect<void, TaskError>
  readonly initialize: (projectRoot: string) => Effect.Effect<void>
  readonly saveToFile: () => Effect.Effect<void>
  readonly loadFromFile: () => Effect.Effect<void>
}

// ============================================================================
// Service Implementation
// ============================================================================

const make = Effect.gen(function* () {
  const state = makeState()

  const create = (task: Omit<TaskItem, "id" | "status" | "createdAt" | "updatedAt">) =>
    Effect.gen(function* () {
      const now = Date.now()
      const newTask = new TaskItem({
        ...task,
        id: generateId(),
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })

      if (newTask.blocks && newTask.blocks.length > 0) {
        if (hasCycle(newTask.id, newTask.blocks, state)) {
          return yield* new CircularDependencyError({ message: "Circular dependency detected" })
        }
      }

      state.tasks.set(newTask.id, newTask)
      log.debug("Created task", { id: newTask.id, subject: newTask.subject })
      return newTask
    })

  const updateStatus = (id: string, status: TaskStatus) =>
    Effect.gen(function* () {
      const task = state.tasks.get(id)
      if (!task) {
        return yield* new TaskNotFoundError({ id })
      }

      const currentStatus = task.status

      if (currentStatus === "completed" && status !== "completed") {
        return yield* new InvalidStatusTransitionError({ id, from: currentStatus, to: status })
      }

      if (status === "in_progress") {
        if (!canStartTask(task, state)) {
          const blockerIds = task.blockedBy?.filter((bid) => {
            const blocker = state.tasks.get(bid)
            return blocker && blocker.status !== "completed"
          })
          return yield* new InvalidStatusTransitionError({
            id,
            from: currentStatus,
            to: status,
          })
        }
        state.activeTaskId = id
      }

      if (currentStatus === "in_progress" && status !== "in_progress") {
        if (state.activeTaskId === id) {
          state.activeTaskId = undefined
        }
      }

      const updatedTask = new TaskItem({
        ...task,
        status,
        updatedAt: Date.now(),
      })
      state.tasks.set(id, updatedTask)

      log.debug("Updated task status", { id, from: currentStatus, to: status })
    })

  const list = () =>
    Effect.sync(() => {
      const tasks = Array.from(state.tasks.values())
      return tasks.sort((a, b) => a.createdAt - b.createdAt)
    })

  const get = (id: string) =>
    Effect.gen(function* () {
      const task = state.tasks.get(id)
      if (!task) {
        return yield* new TaskNotFoundError({ id })
      }
      return task
    })

  const canStart = (id: string) =>
    Effect.gen(function* () {
      const task = yield* get(id)
      return canStartTask(task, state)
    })

  const summary = () =>
    Effect.sync((): TaskSummary => {
      const tasks = Array.from(state.tasks.values())
      return {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        completed: tasks.filter((t) => t.status === "completed").length,
      }
    })

  const activeTask = () =>
    Effect.sync((): TaskItem | undefined => {
      if (!state.activeTaskId) return undefined
      return state.tasks.get(state.activeTaskId)
    })

  const deleteTask = (id: string) =>
    Effect.gen(function* () {
      const task = state.tasks.get(id)
      if (!task) {
        return yield* new TaskNotFoundError({ id })
      }

      for (const otherTask of state.tasks.values()) {
        if (otherTask.blockedBy?.includes(id)) {
          const updated = new TaskItem({
            ...otherTask,
            blockedBy: otherTask.blockedBy.filter((bid) => bid !== id),
            updatedAt: Date.now(),
          })
          state.tasks.set(otherTask.id, updated)
        }
        if (otherTask.blocks?.includes(id)) {
          const updated = new TaskItem({
            ...otherTask,
            blocks: otherTask.blocks.filter((bid) => bid !== id),
            updatedAt: Date.now(),
          })
          state.tasks.set(otherTask.id, updated)
        }
      }

      if (state.activeTaskId === id) {
        state.activeTaskId = undefined
      }

      state.tasks.delete(id)
      log.debug("Deleted task", { id })
    })

  const addDependency = (taskId: string, dependsOnId: string) =>
    Effect.gen(function* () {
      const task = state.tasks.get(taskId)
      const dependsOn = state.tasks.get(dependsOnId)

      if (!task) {
        return yield* new TaskNotFoundError({ id: taskId })
      }
      if (!dependsOn) {
        return yield* new TaskNotFoundError({ id: dependsOnId })
      }

      const newBlocks = [...(task.blocks || []), dependsOnId]
      if (hasCycle(taskId, newBlocks, state)) {
        return yield* new CircularDependencyError({ message: "Adding this dependency would create a cycle" })
      }

      const updatedTask = new TaskItem({
        ...task,
        blocks: newBlocks,
        updatedAt: Date.now(),
      })
      state.tasks.set(taskId, updatedTask)

      const updatedDependsOn = new TaskItem({
        ...dependsOn,
        blockedBy: [...(dependsOn.blockedBy || []), taskId],
        updatedAt: Date.now(),
      })
      state.tasks.set(dependsOnId, updatedDependsOn)

      log.debug("Added dependency", { taskId, dependsOnId })
    })

  const removeDependency = (taskId: string, dependsOnId: string) =>
    Effect.gen(function* () {
      const task = state.tasks.get(taskId)
      const dependsOn = state.tasks.get(dependsOnId)

      if (!task) {
        return yield* new TaskNotFoundError({ id: taskId })
      }

      const updatedTask = new TaskItem({
        ...task,
        blocks: (task.blocks || []).filter((id) => id !== dependsOnId),
        updatedAt: Date.now(),
      })
      state.tasks.set(taskId, updatedTask)

      if (dependsOn) {
        const updatedDependsOn = new TaskItem({
          ...dependsOn,
          blockedBy: (dependsOn.blockedBy || []).filter((id) => id !== taskId),
          updatedAt: Date.now(),
        })
        state.tasks.set(dependsOnId, updatedDependsOn)
      }

      log.debug("Removed dependency", { taskId, dependsOnId })
    })

  // ============================================================================
  // File Persistence Implementation
  // ============================================================================

  const initialize = (projectRoot: string) =>
    Effect.gen(function* () {
      state.projectRoot = projectRoot
      yield* loadFromFile()
      log.debug("Task planner initialized", { projectRoot })
    })

  const saveToFile = () =>
    Effect.gen(function* () {
      if (!state.projectRoot) {
        log.debug("No project root set, skipping save")
        return
      }

      const filePath = path.join(state.projectRoot, TASKS_FILE)
      const data = serializeTasks(state.tasks)

      const opencodeDir = path.join(state.projectRoot, ".opencode")
      yield* Effect.promise(() =>
        Bun.file(opencodeDir).stat().catch(() =>
          Bun.write(opencodeDir, "")
        )
      )

      yield* Effect.promise(() => Bun.write(filePath, data))
      log.debug("Tasks saved to file", { filePath, count: state.tasks.size })
    }).pipe(
      Effect.catch((error) => {
        log.error("Failed to save tasks to file", { error: String(error) })
        return Effect.void
      }),
    )

  const loadFromFile = () =>
    Effect.gen(function* () {
      if (!state.projectRoot) {
        log.debug("No project root set, skipping load")
        return
      }

      const filePath = path.join(state.projectRoot, TASKS_FILE)

      const file = Bun.file(filePath)
      const exists = yield* Effect.promise(() =>
        file.exists().catch(() => false)
      )

      if (!exists) {
        log.debug("No existing tasks file found", { filePath })
        return
      }

      const data = yield* Effect.promise(() => file.text())
      const tasks = deserializeTasks(data)

      state.tasks.clear()
      state.activeTaskId = undefined

      for (const task of tasks) {
        state.tasks.set(task.id, task)
        if (task.status === "in_progress") {
          state.activeTaskId = task.id
        }
      }

      log.debug("Tasks loaded from file", { filePath, count: tasks.length })
    }).pipe(
      Effect.catch((error) => {
        log.error("Failed to load tasks from file", { error: String(error) })
        state.tasks.clear()
        state.activeTaskId = undefined
        return Effect.void
      }),
    )

  // Auto-save after state changes
  const createWithSave = (task: Omit<TaskItem, "id" | "status" | "createdAt" | "updatedAt">) =>
    Effect.gen(function* () {
      const result = yield* create(task)
      yield* saveToFile()
      return result
    })

  const updateStatusWithSave = (id: string, status: TaskStatus) =>
    Effect.gen(function* () {
      yield* updateStatus(id, status)
      yield* saveToFile()
    })

  const deleteWithSave = (id: string) =>
    Effect.gen(function* () {
      yield* deleteTask(id)
      yield* saveToFile()
    })

  const addDependencyWithSave = (taskId: string, dependsOnId: string) =>
    Effect.gen(function* () {
      yield* addDependency(taskId, dependsOnId)
      yield* saveToFile()
    })

  const removeDependencyWithSave = (taskId: string, dependsOnId: string) =>
    Effect.gen(function* () {
      yield* removeDependency(taskId, dependsOnId)
      yield* saveToFile()
    })

  return {
    create: createWithSave,
    updateStatus: updateStatusWithSave,
    list,
    get,
    canStart,
    summary,
    activeTask,
    delete: deleteWithSave,
    addDependency: addDependencyWithSave,
    removeDependency: removeDependencyWithSave,
    initialize,
    saveToFile,
    loadFromFile,
  } satisfies Interface
})

// ============================================================================
// Service Export
// ============================================================================

export class Service extends Context.Service<Service, Interface>()("@opencode/Task") {}

export const layer = Layer.effect(Service, make)
export const defaultLayer = layer

export * as Task from "./task"
