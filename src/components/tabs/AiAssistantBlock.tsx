import React, { useState } from 'react';
import { EventItem, TimelineItem } from '../../types/event';
import { generateSmartTimeline } from '../../services/aiPlanner';
import { Sparkles, Wand2, Check, ArrowRight, Lightbulb, Clock, MapPin, RefreshCw } from 'lucide-react';

interface AiAssistantBlockProps {
  event: EventItem;
  onApplyTimeline: (items: TimelineItem[]) => void;
}

export const AiAssistantBlock: React.FC<AiAssistantBlockProps> = ({
  event,
  onApplyTimeline,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<{
    items: TimelineItem[];
    suggestions: string[];
  } | null>(null);
  const [applied, setApplied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setApplied(false);
    try {
      const result = await generateSmartTimeline(event, prompt);
      setGeneratedPlan(result);
    } catch (err) {
      console.error('Failed to generate plan:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (generatedPlan?.items) {
      onApplyTimeline(generatedPlan.items);
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    }
  };

  return (
    /* Subtle #F4F5FA nested panel */
    <div className="bg-[#F4F5FA] rounded-[16px] border border-[#E5E7EB] overflow-hidden mb-8 shadow-surface-card">
      {/* #EDE9FE gradient-tinted header featuring deep violet #4B2FC9 spark line icon */}
      <div className="bg-gradient-to-r from-[#EDE9FE] via-[#F4F5FA] to-[#EDE9FE] p-5 sm:p-6 border-b border-[#DDD6FE]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-[#DDD6FE] flex items-center justify-center text-[#4B2FC9] shadow-sm shrink-0">
            <Sparkles className="w-5 h-5 text-[#4B2FC9] stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-[#111827]">
                EventPilot Smart Planner
              </h3>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#4B2FC9] text-white">
                Rule-based planner v1
              </span>
            </div>
            <p className="text-xs text-[#4B5563]">
              Deterministic flow optimization, transition buffers, and run-of-show scheduling
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => handleGenerate()}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-[10px] bg-[#4B2FC9] hover:bg-[#3C24A4] active:scale-[0.98] text-white font-semibold text-xs transition-all cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Scheduling...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>Auto-generate Schedule</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body container */}
      <div className="p-5 sm:p-6 space-y-5">
        {/* Custom refinement input */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Event Constraints & Host Preferences (Optional)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Ensure a 30-min buffer between ceremony and speeches, wrap up music at 23:00..."
              className="flex-1 h-11 px-3.5 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#4B2FC9] focus:ring-3 focus:ring-[#4B2FC9]/15"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-11 px-4 rounded-[10px] bg-white border border-[#DDD6FE] text-[#4B2FC9] hover:bg-[#EDE9FE] font-semibold text-xs transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            >
              Re-calculate
            </button>
          </div>
        </div>

        {/* Quick sample prompts */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
            Quick Presets:
          </span>
          {[
            'Include 20-min photo buffer',
            'Sunset ceremony',
            'Extended cocktail mingling',
            'Live band soundcheck buffer',
          ].map((quick, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setPrompt(quick);
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-white border border-[#E5E7EB] text-[#4B5563] hover:text-[#4B2FC9] hover:border-[#DDD6FE] transition-colors cursor-pointer"
            >
              + {quick}
            </button>
          ))}
        </div>

        {/* Generated output review */}
        {generatedPlan && (
          <div className="bg-white rounded-[14px] border border-[#DDD6FE] p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E7EB]">
              <div>
                <span className="text-xs font-bold text-[#4B2FC9] uppercase tracking-wider">
                  Auto-generated Itinerary ({generatedPlan.items.length} Milestones)
                </span>
                <p className="text-xs text-[#4B5563]">
                  Review the schedule below. You can apply it directly to your active timeline.
                </p>
              </div>

              <button
                onClick={handleApply}
                className={`inline-flex items-center gap-2 px-4 h-9 rounded-[10px] text-xs font-bold transition-all cursor-pointer ${
                  applied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#4B2FC9] hover:bg-[#3C24A4] text-white shadow-sm'
                }`}
              >
                {applied ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Applied to Timeline!</span>
                  </>
                ) : (
                  <>
                    <span>Apply to Active Timeline</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Suggestions list */}
            {generatedPlan.suggestions.length > 0 && (
              <div className="bg-[#EDE9FE]/50 rounded-[10px] p-3 border border-[#DDD6FE]/60">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#4B2FC9] mb-1.5">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Host Advisory & Buffer Tips:</span>
                </div>
                <ul className="text-xs text-[#4B5563] space-y-1 list-disc list-inside">
                  {generatedPlan.suggestions.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Generated Items Preview List */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {generatedPlan.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-[10px] bg-[#F4F5FA] border border-[#E5E7EB]/70 text-xs"
                >
                  <div className="font-mono font-bold text-[#4B2FC9] px-2 py-1 rounded bg-[#EDE9FE] shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{item.time}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#111827]">{item.title}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E5E7EB] text-[#4B5563]">
                        {item.phase}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-[#4B5563] mt-0.5">{item.description}</p>
                    )}
                    {item.location && (
                      <div className="flex items-center gap-1 text-[11px] text-[#9CA3AF] mt-1">
                        <MapPin className="w-3 h-3" />
                        <span>{item.location}</span>
                        {item.assignedTo && (
                          <span>• Lead: {item.assignedTo}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
