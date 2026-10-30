import React, { useState } from 'react';
import { EventItem, TaskItem } from '../../types/event';
import { calculateTaskProgress } from '../../utils/eventCalculations';
import { generatePlan } from '../../services/api';
import confetti from 'canvas-confetti';
import {
  Plus,
  Check,
  Trash2,
  Calendar,
  User,
  ListChecks,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface TasksTabProps {
  event: EventItem;
  onUpdateEvent: (updated: EventItem) => void;
}

function computeDueDate(eventDateStr: string | undefined, phaseName: string): string {
  if (!eventDateStr) return '';
  const [y, m, d] = eventDateStr.split('-').map(Number);
  if (!y || !m || !d) return eventDateStr;

  const eventDate = new Date(y, m - 1, d);
  const phaseLower = phaseName.toLowerCase();

  let daysBefore = 0;
  if (phaseLower.includes('3 months') || phaseLower.includes('90 days')) {
    daysBefore = 90;
  } else if (phaseLower.includes('1 month') || phaseLower.includes('30 days')) {
    daysBefore = 30;
  } else if (phaseLower.includes('week')) {
    daysBefore = 7;
  } else if (phaseLower.includes('day of')) {
    daysBefore = 0;
  }

  const computed = new Date(eventDate.getTime() - daysBefore * 24 * 60 * 60 * 1000);
  return computed.toISOString().split('T')[0];
}

function computePriority(phaseName: string): TaskItem['priority'] {
  const norm = phaseName.toLowerCase();
  if (norm.includes('week') || norm.includes('day of') || norm.includes('final') || norm.includes('high')) {
    return 'high';
  }
  if (norm.includes('1 month') || norm.includes('month') || norm.includes('medium')) {
    return 'medium';
  }
  return 'low';
}

export const TasksTab: React.FC<TasksTabProps> = ({ event, onUpdateEvent }) => {
  const [filterPriority, setFilterPriority] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [newTask, setNewTask] = useState({
    title: '',
    dueDate: '',
    priority: 'medium' as TaskItem['priority'],
    category: 'Coordination',
    assignedTo: '',
  });

  const progress = calculateTaskProgress(event.tasks);

  const handleImportChecklist = async () => {
    if (event.tasks.length > 0) {
      const ok = window.confirm(
        'Replace current tasks with the backend rule-based checklist?'
      );
      if (!ok) return;
    }

    setIsImporting(true);
    setImportError(null);
    try {
      const plan = await generatePlan({
        event_type: event.category,
        budget: event.totalBudget,
        guest_count: event.targetGuests,
        event_date: event.date || undefined,
      });

      const importedTasks: TaskItem[] = [];
      if (Array.isArray(plan.checklist)) {
        for (const section of plan.checklist) {
          const phase = section.phase || 'General';
          const priority = computePriority(phase);
          const dueDate = computeDueDate(event.date, phase);

          if (Array.isArray(section.tasks)) {
            for (const t of section.tasks) {
              importedTasks.push({
                id: crypto.randomUUID(),
                title: t.task,
                category: phase,
                priority,
                dueDate,
                completed: Boolean(t.done),
              });
            }
          }
        }
      }

      onUpdateEvent({
        ...event,
        tasks: importedTasks,
        ruleBasedPlan: {
          ...event.ruleBasedPlan,
          warnings: plan.warnings,
          per_guest_cost: plan.per_guest_cost,
          days_until_event: plan.days_until_event,
          total_budget: plan.total_budget,
          guest_count: plan.guest_count,
          generated_by: plan.generated_by,
        },
      });
    } catch (err: any) {
      console.error('Failed to import checklist:', err);
      setImportError(err.message || 'Failed to import checklist from backend.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleTask = (id: string) => {
    const updated = event.tasks.map((task) => {
      if (task.id === id) {
        const nextState = !task.completed;
        if (nextState) {
          try {
            confetti({
              particleCount: 40,
              spread: 60,
              origin: { y: 0.8 },
              colors: ['#4B2FC9', '#EDE9FE', '#0D9488', '#D97706'],
            });
          } catch {
            // ignore
          }
        }
        return { ...task, completed: nextState };
      }
      return task;
    });

    onUpdateEvent({ ...event, tasks: updated });
  };

  const handleDeleteTask = (id: string) => {
    const updated = event.tasks.filter((t) => t.id !== id);
    onUpdateEvent({ ...event, tasks: updated });
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    const task: TaskItem = {
      id: crypto.randomUUID(),
      title: newTask.title.trim(),
      dueDate: newTask.dueDate || event.date,
      priority: newTask.priority,
      category: newTask.category,
      assignedTo: newTask.assignedTo.trim() || undefined,
      completed: false,
    };

    onUpdateEvent({
      ...event,
      tasks: [...event.tasks, task],
    });

    setShowAddModal(false);
    setNewTask({
      title: '',
      dueDate: '',
      priority: 'medium',
      category: 'Coordination',
      assignedTo: '',
    });
  };

  const filteredTasks = event.tasks.filter((t) => {
    const matchesPriority = filterPriority === 'all' || t.priority === filterPriority;
    const matchesCompletion = showCompleted ? true : !t.completed;
    return matchesPriority && matchesCompletion;
  });

  const priorityBadgeClasses = {
    high: 'bg-rose-50 text-rose-700 border-rose-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  return (
    <div className="space-y-6">
      {importError && (
        <div className="p-4 rounded-[12px] bg-rose-50 border border-rose-200 flex items-center justify-between gap-3 text-xs text-rose-900 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{importError}</span>
          </div>
          <button
            onClick={() => setImportError(null)}
            className="text-rose-600 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Progress & Quick Stats Card */}
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-6 shadow-surface-card flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-[#4B5563] uppercase tracking-wider">
            Execution Progress
          </span>
          <h3 className="text-2xl font-bold text-[#111827]">
            {progress.completed} of {progress.total} Tasks Completed ({progress.percentage}%)
          </h3>
          <p className="text-xs text-[#4B5563]">
            {progress.total - progress.completed} pending deliverables before showtime
          </p>
        </div>

        <div className="w-full sm:w-64 space-y-2">
          <div className="w-full bg-[#E5E7EB] rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-[#4B2FC9] rounded-full transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-[#9CA3AF] font-medium">
            <span>0%</span>
            <span>Target: 100% Ready</span>
          </div>
        </div>
      </div>

      {/* Filter and Action Controls */}
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-surface-card">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'high', 'medium', 'low'] as const).map((pr) => (
            <button
              key={pr}
              onClick={() => setFilterPriority(pr)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer ${
                filterPriority === pr
                  ? 'bg-[#4B2FC9] text-white shadow-xs'
                  : 'bg-[#F4F5FA] text-[#4B5563] hover:text-[#111827]'
              }`}
            >
              {pr === 'all' ? 'All Priorities' : `${pr} Priority`}
            </button>
          ))}

          <label className="flex items-center gap-2 ml-2 text-xs text-[#4B5563] cursor-pointer">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="w-4 h-4 rounded text-[#4B2FC9] focus:ring-[#4B2FC9]"
            />
            <span>Show Completed</span>
          </label>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Import checklist button */}
          <button
            onClick={handleImportChecklist}
            disabled={isImporting}
            className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-[10px] bg-[#EDE9FE] hover:bg-[#DDD6FE] text-[#4B2FC9] text-xs font-semibold border border-[#DDD6FE] transition-colors cursor-pointer disabled:opacity-50"
            title="Import structured checklist phases from backend rule-based planner"
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <ListChecks className="w-3.5 h-3.5" />
                <span>Import checklist</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-[10px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-[16px] border border-[#E5E7EB] divide-y divide-[#E5E7EB] overflow-hidden shadow-surface-card">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center text-[#9CA3AF]">
            No tasks found. Click "Add Task" or "Import checklist" to load recommended deliverables.
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              className={`p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-[#F9FAFB] transition-colors group ${
                task.completed ? 'bg-gray-50/50' : ''
              }`}
            >
              <div className="flex items-center gap-4 flex-1">
                <div
                  className="w-11 h-11 flex items-center justify-center cursor-pointer shrink-0"
                  onClick={() => handleToggleTask(task.id)}
                  role="checkbox"
                  aria-checked={task.completed}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleToggleTask(task.id);
                    }
                  }}
                >
                  <div
                    className={`w-5 h-5 rounded-[6px] border transition-all duration-150 flex items-center justify-center ${
                      task.completed
                        ? 'bg-[#4B2FC9] border-[#4B2FC9] text-white shadow-xs'
                        : 'bg-white border-[#E5E7EB] hover:border-[#4B2FC9]'
                    }`}
                  >
                    {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`text-sm font-semibold text-[#111827] transition-all ${
                        task.completed ? 'line-through text-[#9CA3AF]' : ''
                      }`}
                    >
                      {task.title}
                    </span>

                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        priorityBadgeClasses[task.priority]
                      }`}
                    >
                      {task.priority}
                    </span>

                    {task.category && (
                      <span className="text-[11px] text-[#9CA3AF] px-2 py-0.5 bg-[#F4F5FA] rounded-md border border-[#E5E7EB]">
                        {task.category}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#9CA3AF]">
                    {task.dueDate && (
                      <div className="flex items-center gap-1 text-[#4B5563]">
                        <Calendar className="w-3.5 h-3.5 text-[#9CA3AF]" />
                        <span>Due: {task.dueDate}</span>
                      </div>
                    )}
                    {task.assignedTo && (
                      <div className="flex items-center gap-1 text-[#4B5563]">
                        <User className="w-3.5 h-3.5 text-[#0D9488]" />
                        <span>Assignee: {task.assignedTo}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-rose-600 rounded-md transition-all cursor-pointer"
                title="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-[16px] border border-[#E5E7EB] shadow-surface-modal w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-[#111827] mb-1">Add Task</h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Add a checklist item to ensure zero loose ends before event day.
            </p>

            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Confirm acoustic music volume limits with venue"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Priority
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        priority: e.target.value as TaskItem['priority'],
                      })
                    }
                    className="w-full h-11 px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    placeholder="Coordination, Catering, AV..."
                    value={newTask.category}
                    onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111827] mb-1">
                    Assigned Lead
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Lead Coordinator"
                    value={newTask.assignedTo}
                    onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                    className="w-full h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] focus:outline-none focus:border-[#4B2FC9]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 h-11 rounded-[12px] bg-white border border-[#E5E7EB] text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 h-11 rounded-[12px] bg-[#4B2FC9] hover:bg-[#3C24A4] text-sm font-semibold text-white shadow-sm cursor-pointer"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
